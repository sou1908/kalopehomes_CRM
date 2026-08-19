import "server-only";
import { nanoid } from "nanoid";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { leads, pipelines, leadStages, leadPipelineHistory } from "./db/schema";
import { parseJourney } from "./leads-shared";
import { setLeadPipeline, canWorkPipeline } from "./pipelines";
import { transferLead } from "./transfer";
import { listMembers } from "./members";
import type { LeadActor } from "./leads";

/**
 * A lead's step through one pipeline: the captured answers, and completing it.
 *
 * Completing IS the handoff, and has to be. The moment a lead moves on it
 * belongs to the next team, so if the person finishing their step doesn't
 * choose who takes it, nobody can — they've just lost the right to assign it.
 */

/** Whoever could take a lead next — members whose roles work that pipeline. */
export async function handoffCandidates(
  orgId: string,
  pipelineId: string,
): Promise<Array<{ id: string; name: string }>> {
  const found = await db
    .select({ roles: pipelines.roles })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.id, pipelineId)))
    .limit(1);
  if (found.length === 0) return [];

  let roles: string[] = [];
  try {
    const v = JSON.parse(found[0].roles);
    if (Array.isArray(v)) roles = v.filter((x) => typeof x === "string");
  } catch {
    roles = [];
  }

  const members = await listMembers(orgId);
  return members
    .filter((m) => canWorkPipeline({ roles }, m.roles))
    .map((m) => ({ id: m.id, name: m.name }));
}

/** The pipeline after this one, or null when this is the last. */
export async function nextPipeline(
  orgId: string,
  pipelineId: string,
): Promise<{ id: string; name: string } | null> {
  const all = await db
    .select({ id: pipelines.id, name: pipelines.name })
    .from(pipelines)
    .where(eq(pipelines.orgId, orgId))
    .orderBy(asc(pipelines.position));
  const idx = all.findIndex((p) => p.id === pipelineId);
  return idx === -1 ? null : (all[idx + 1] ?? null);
}

/**
 * Save the step's answers, and on completion hand the lead on.
 *
 * Completing does four things as one move: stamps who finished it and when,
 * parks the lead on this pipeline's exit stage, records the finished run in
 * `lead_pipeline_history` (so this pipeline can still show it as won after the
 * lead has moved on), and transfers it to the next pipeline — to
 * `handoffUserId` when one is chosen, which assigns and notifies them too.
 */
export async function saveJourneyStep(input: {
  leadId: string;
  orgId: string;
  pipelineId: string;
  values: Record<string, string>;
  complete: boolean;
  actor: LeadActor;
  /** Who takes it next. Only meaningful when completing. */
  handoffUserId?: string | null;
}): Promise<void> {
  const rows = await db
    .select({ journey: leads.journey })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)))
    .limit(1);
  if (rows.length === 0) return;

  const journey = parseJourney(rows[0].journey);
  const prev = journey[input.pipelineId];
  journey[input.pipelineId] = {
    done: input.complete ? true : (prev?.done ?? false),
    by: input.complete ? input.actor.name : (prev?.by ?? null),
    at: input.complete ? Date.now() : (prev?.at ?? null),
    fields: { ...(prev?.fields ?? {}), ...input.values },
  };

  await db
    .update(leads)
    .set({ journey: JSON.stringify(journey), updatedAt: new Date() })
    .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)));

  if (!input.complete) return;

  // Park it on this pipeline's exit stage — its "won" — so the finished run is
  // recorded against the right stage rather than wherever it happened to be.
  const exit = (
    await db
      .select({ id: leadStages.id })
      .from(leadStages)
      .where(
        and(
          eq(leadStages.orgId, input.orgId),
          eq(leadStages.pipelineId, input.pipelineId),
          eq(leadStages.isExit, true),
        ),
      )
      .limit(1)
  )[0];
  if (exit) {
    await db
      .update(leads)
      .set({ stageId: exit.id })
      .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)));
  }

  await db.insert(leadPipelineHistory).values({
    id: nanoid(21),
    orgId: input.orgId,
    leadId: input.leadId,
    pipelineId: input.pipelineId,
    stageId: exit?.id ?? null,
    byUserId: input.actor.userId,
  });

  const next = await nextPipeline(input.orgId, input.pipelineId);
  if (!next) return;

  if (input.handoffUserId) {
    // Moves the pipeline, assigns them as primary, notifies them, logs it.
    await transferLead(
      input.leadId,
      input.orgId,
      next.id,
      input.handoffUserId,
      input.actor,
    );
  } else {
    // No one named — it lands in the next pipeline's queue for anyone there.
    await setLeadPipeline(input.leadId, input.orgId, next.id, input.actor);
  }
}
