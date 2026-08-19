import "server-only";
import { nanoid } from "nanoid";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { leadAssignees, leads, leadActivities, users } from "./db/schema";
import { createNotification } from "./notifications";
import type { LeadActor } from "./leads";

export class AssigneeError extends Error {}

export type AssigneeView = {
  userId: string;
  name: string;
  isPrimary: boolean;
};

/** Everyone working a lead, primary first then by recency. */
export async function listLeadAssignees(leadId: string): Promise<AssigneeView[]> {
  const rows = await db
    .select({
      userId: leadAssignees.userId,
      isPrimary: leadAssignees.isPrimary,
      name: users.name,
      addedAt: leadAssignees.addedAt,
    })
    .from(leadAssignees)
    .innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(eq(leadAssignees.leadId, leadId))
    .orderBy(desc(leadAssignees.isPrimary), desc(leadAssignees.addedAt));
  return rows.map((r) => ({ userId: r.userId, name: r.name, isPrimary: r.isPrimary }));
}

/** Assignees for many leads at once → Map<leadId, AssigneeView[]> (board/list). */
export async function assigneesForLeads(
  leadIds: string[],
): Promise<Map<string, AssigneeView[]>> {
  const out = new Map<string, AssigneeView[]>();
  if (leadIds.length === 0) return out;
  const rows = await db
    .select({
      leadId: leadAssignees.leadId,
      userId: leadAssignees.userId,
      isPrimary: leadAssignees.isPrimary,
      name: users.name,
    })
    .from(leadAssignees)
    .innerJoin(users, eq(users.id, leadAssignees.userId))
    .where(inArray(leadAssignees.leadId, leadIds))
    .orderBy(desc(leadAssignees.isPrimary));
  for (const r of rows) {
    const list = out.get(r.leadId) ?? [];
    list.push({ userId: r.userId, name: r.name, isPrimary: r.isPrimary });
    out.set(r.leadId, list);
  }
  return out;
}

/** Lead ids the user is assigned to (for the "My leads" filter). */
export async function myAssignedLeadIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ leadId: leadAssignees.leadId })
    .from(leadAssignees)
    .where(eq(leadAssignees.userId, userId));
  return new Set(rows.map((r) => r.leadId));
}

async function leadName(leadId: string, orgId: string): Promise<string | null> {
  const rows = await db
    .select({ name: leads.name })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  return rows[0]?.name ?? null;
}

/**
 * Attach a staff member to a lead. Validates org membership, logs an `assigned`
 * activity, and notifies the new assignee (unless they added themselves). When
 * `primary`, demotes any existing primary first. No-op if already assigned (but
 * still applies the primary flag).
 */
export async function addLeadAssignee(
  leadId: string,
  orgId: string,
  userId: string,
  actor: LeadActor,
  opts: { primary?: boolean; silent?: boolean } = {},
): Promise<void> {
  const name = await leadName(leadId, orgId);
  if (name === null) throw new AssigneeError("Lead not found.");

  const member = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (member.length === 0) throw new AssigneeError("That member isn't in your team.");

  if (opts.primary) {
    await db
      .update(leadAssignees)
      .set({ isPrimary: false })
      .where(eq(leadAssignees.leadId, leadId));
  }

  const existing = await db
    .select({ userId: leadAssignees.userId })
    .from(leadAssignees)
    .where(and(eq(leadAssignees.leadId, leadId), eq(leadAssignees.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    if (opts.primary) {
      await db
        .update(leadAssignees)
        .set({ isPrimary: true })
        .where(and(eq(leadAssignees.leadId, leadId), eq(leadAssignees.userId, userId)));
    }
    return; // already attached
  }

  await db.insert(leadAssignees).values({
    leadId,
    userId,
    isPrimary: opts.primary ?? false,
    addedByUserId: actor.userId,
  });

  // A richer transfer logs its own combined entry, so skip the per-assign log.
  if (!opts.silent) {
    await db.insert(leadActivities).values({
      id: nanoid(21),
      orgId,
      leadId,
      userId: actor.userId,
      actorName: actor.name,
      kind: "assigned",
      body: `Assigned ${member[0].name}${opts.primary ? " (primary)" : ""}`,
    });
  }

  if (userId !== actor.userId) {
    await createNotification({
      userId,
      type: "lead_assigned",
      title: `${actor.name} assigned you a lead`,
      body: name,
      link: `/leads/${leadId}`,
      actorName: actor.name,
    });
  }
}

/** Remove a staff member from a lead (logs it). */
export async function removeLeadAssignee(
  leadId: string,
  orgId: string,
  userId: string,
  actor: LeadActor,
): Promise<void> {
  const member = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  await db
    .delete(leadAssignees)
    .where(and(eq(leadAssignees.leadId, leadId), eq(leadAssignees.userId, userId)));
  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId,
    leadId,
    userId: actor.userId,
    actorName: actor.name,
    kind: "assigned",
    body: `Removed ${member[0]?.name ?? "someone"}`,
  });
}

/** Make one assignee the primary (demotes the rest). */
export async function setPrimaryAssignee(
  leadId: string,
  userId: string,
): Promise<void> {
  await db
    .update(leadAssignees)
    .set({ isPrimary: false })
    .where(eq(leadAssignees.leadId, leadId));
  await db
    .update(leadAssignees)
    .set({ isPrimary: true })
    .where(and(eq(leadAssignees.leadId, leadId), eq(leadAssignees.userId, userId)));
}
