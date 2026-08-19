import "server-only";
import { nanoid } from "nanoid";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { desks, leads, leadActivities, users, userRoles } from "./db/schema";
import { setLeadDesk } from "./desks";
import { addLeadAssignee } from "./assignees";
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
 * Step a lead to a desk AND attach a handler there (as primary) in one move.
 * Logs a single `transferred` entry and notifies the handler.
 */
export async function transferLead(
  leadId: string,
  orgId: string,
  deskId: string,
  userId: string,
  actor: LeadActor,
): Promise<void> {
  const desk = (
    await db
      .select({ name: desks.name })
      .from(desks)
      .where(and(eq(desks.id, deskId), eq(desks.orgId, orgId)))
      .limit(1)
  )[0];
  if (!desk) throw new TransferError("Invalid desk.");
  const member = (
    await db
      .select({ name: users.name })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
      .limit(1)
  )[0];
  if (!member) throw new TransferError("That member isn't in your team.");
  await leadName(leadId, orgId);

  await setLeadDesk(leadId, orgId, deskId, actor, { silent: true });
  // Notifies the handler; we log the combined transfer entry ourselves.
  await addLeadAssignee(leadId, orgId, userId, actor, { primary: true, silent: true });

  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "transferred",
    body: `Transferred to ${member.name} · ${desk.name} desk`,
  });
}

/**
 * Escalate a lead to the final (Manager) desk and ping every Lead Manager.
 * No specific handler required — it surfaces in the managers' inbox.
 */
export async function escalateToManager(
  leadId: string,
  orgId: string,
  actor: LeadActor,
): Promise<void> {
  const all = await db
    .select()
    .from(desks)
    .where(eq(desks.orgId, orgId))
    .orderBy(asc(desks.position));
  const last = all.at(-1);
  if (!last) throw new TransferError("No desks configured.");
  const name = await leadName(leadId, orgId);

  await setLeadDesk(leadId, orgId, last.id, actor, { silent: true });
  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "transferred",
    body: `Escalated to the ${last.name} desk`,
  });

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.orgId, orgId), eq(userRoles.role, "super_admin")));
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
