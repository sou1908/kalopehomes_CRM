import "server-only";
import { nanoid } from "nanoid";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  pipelines,
  leads,
  leadActivities,
  users,
  userRoles,
  leadStages,
  leadAssignees,
  leadPipelineHistory,
} from "./db/schema";
import { setLeadPipeline, listPipelines, canWorkPipeline } from "./pipelines";
import { addLeadAssignee } from "./assignees";
import { parseJourney } from "./leads-shared";
import { createNotification } from "./notifications";
import type { LeadActor } from "./leads";

export class TransferError extends Error {}

async function leadName(leadId: string, orgId: string): Promise<string> {
  const rows = await db
    .select({ name: leads.name })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (rows.length === 0) throw new TransferError("Lead not found.");
  return rows[0].name;
}

/**
 * Step a lead to a pipeline AND attach a handler there (as primary) in one move.
 * Logs a single `transferred` entry and notifies the handler.
 */
export async function transferLead(
  leadId: string,
  orgId: string,
  pipelineId: string,
  userId: string,
  actor: LeadActor,
): Promise<void> {
  const pipeline = (
    await db
      .select({ name: pipelines.name })
      .from(pipelines)
      .where(and(eq(pipelines.id, pipelineId), eq(pipelines.orgId, orgId)))
      .limit(1)
  )[0];
  if (!pipeline) throw new TransferError("Invalid pipeline.");
  const member = (
    await db
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
      .limit(1)
  )[0];
  if (!member) throw new TransferError("That member isn't in your team.");
  await leadName(leadId, orgId);

  await setLeadPipeline(leadId, orgId, pipelineId, actor, { silent: true });
  // Notifies the handler; we log the combined transfer entry ourselves.
  await addLeadAssignee(leadId, orgId, userId, actor, { primary: true, silent: true });

  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "transferred",
    body: `Transferred to ${member.name} · ${pipeline.name} pipeline`,
  });
}

/**
 * Escalate a lead to the final (Manager) pipeline and ping every Lead Manager.
 * No specific handler required — it surfaces in the managers' inbox.
 */
export async function escalateToManager(
  leadId: string,
  orgId: string,
  actor: LeadActor,
): Promise<void> {
  const all = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.orgId, orgId))
    .orderBy(asc(pipelines.position));
  const last = all.at(-1);
  if (!last) throw new TransferError("No pipelines configured.");
  const name = await leadName(leadId, orgId);

  await setLeadPipeline(leadId, orgId, last.id, actor, { silent: true });
  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "transferred",
    body: `Escalated to the ${last.name} pipeline`,
  });

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.orgId, orgId), eq(userRoles.role, "admin")));
  for (const a of admins) {
    if (a.id === actor.userId) continue;
    await createNotification({
      userId: a.id,
      type: "lead_escalated",
      title: `${actor.name} escalated a lead`,
      body: name,
      link: `/leads/${leadId}`,
      actorName: actor.name,
    });
  }
}

/**
 * Put a lead back where it was before its last transfer.
 *
 * For mistakes — wrong person, wrong pipeline, transferred too early. Whoever
 * can work the pipeline it came FROM may undo it, which is the point: once a
 * lead moves on, the person who sent it can no longer act on it, so the undo
 * has to be judged on the origin rather than the destination.
 *
 * Refused once the receiving team has started: if they've moved it off their
 * first stage or completed their step, it's their lead now and pulling it back
 * would discard their work.
 */
export async function undoTransfer(
  leadId: string,
  orgId: string,
  actor: LeadActor,
  roles: string[],
): Promise<void> {
  const lead = (
    await db
      .select({ pipelineId: leads.pipelineId, journey: leads.journey })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
      .limit(1)
  )[0];
  if (!lead) throw new TransferError("Lead not found.");

  // The most recent completed run is the pipeline it came from.
  const history = await db
    .select()
    .from(leadPipelineHistory)
    .where(
      and(
        eq(leadPipelineHistory.leadId, leadId),
        eq(leadPipelineHistory.orgId, orgId),
      ),
    )
    .orderBy(desc(leadPipelineHistory.completedAt));
  const last = history[0];
  if (!last?.pipelineId) throw new TransferError("This lead hasn't been transferred.");

  const all = await listPipelines(orgId);
  const from = all.find((p) => p.id === last.pipelineId);
  if (!from) throw new TransferError("The original pipeline no longer exists.");
  if (!canWorkPipeline(from, roles)) {
    throw new TransferError(`Only the ${from.name} team can undo this transfer.`);
  }

  // Has the receiving team started?
  if (lead.pipelineId && lead.pipelineId !== from.id) {
    const journey = parseJourney(lead.journey);
    if (journey[lead.pipelineId]?.done) {
      throw new TransferError(
        "The receiving team has already completed their step — this can't be undone.",
      );
    }
    const entry = (
      await db
        .select({ id: leadStages.id })
        .from(leadStages)
        .where(
          and(
            eq(leadStages.orgId, orgId),
            eq(leadStages.pipelineId, lead.pipelineId),
          ),
        )
        .orderBy(asc(leadStages.position))
        .limit(1)
    )[0];
    const current = (
      await db
        .select({ stageId: leads.stageId })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
        .limit(1)
    )[0];
    if (entry && current?.stageId && current.stageId !== entry.id) {
      throw new TransferError(
        "The receiving team has already moved this lead on — this can't be undone.",
      );
    }
  }

  // Restore pipeline and the stage it was on when it left. Written directly
  // rather than through setLeadPipeline, which would log a fresh completed run.
  await db
    .update(leads)
    .set({
      pipelineId: from.id,
      ...(last.stageId ? { stageId: last.stageId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));

  await db
    .delete(leadPipelineHistory)
    .where(eq(leadPipelineHistory.id, last.id));

  // Drop assignees who can't work the pipeline it's gone back to — they were
  // attached by the transfer being undone.
  const assigned = await db
    .select({ userId: leadAssignees.userId })
    .from(leadAssignees)
    .where(eq(leadAssignees.leadId, leadId));
  for (const a of assigned) {
    const theirRoles = (
      await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, a.userId))
    ).map((r) => r.role as string);
    if (!canWorkPipeline(from, theirRoles)) {
      await db
        .delete(leadAssignees)
        .where(
          and(eq(leadAssignees.leadId, leadId), eq(leadAssignees.userId, a.userId)),
        );
    }
  }

  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "transferred",
    body: `Transfer undone — back to ${from.name}`,
  });
}
