import "server-only";
import { nanoid } from "nanoid";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { desks, leads, leadActivities } from "./db/schema";
import type { Desk } from "./db/schema";
import type { LeadActor } from "./leads";

export class DeskError extends Error {}

const STAGE_COLORS = [
  "#6a89a8",
  "#d99756",
  "#7c9e6d",
  "#b85a3d",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
];

/** The org's handling desks, ordered Telecalling → … → Manager. */
export async function listDesks(orgId: string): Promise<Desk[]> {
  return db
    .select()
    .from(desks)
    .where(eq(desks.orgId, orgId))
    .orderBy(asc(desks.position), asc(desks.createdAt));
}

async function getDesk(id: string, orgId: string): Promise<Desk | null> {
  const rows = await db
    .select()
    .from(desks)
    .where(and(eq(desks.id, id), eq(desks.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The first desk (entry point — Telecalling) for new/orphaned leads. */
export async function firstDeskId(orgId: string): Promise<string | null> {
  const rows = await listDesks(orgId);
  return rows[0]?.id ?? null;
}

export async function createDesk(input: {
  orgId: string;
  name: string;
  color?: string;
}): Promise<Desk> {
  const name = input.name.trim();
  if (!name) throw new DeskError("Desk name is required.");
  const existing = await listDesks(input.orgId);
  const lastPos = existing.at(-1)?.position ?? 0;
  const color = input.color || STAGE_COLORS[existing.length % STAGE_COLORS.length];
  const id = nanoid(21);
  await db.insert(desks).values({
    id,
    orgId: input.orgId,
    name,
    color,
    position: lastPos + 10,
  });
  return (await getDesk(id, input.orgId))!;
}

export async function updateDesk(
  id: string,
  orgId: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const desk = await getDesk(id, orgId);
  if (!desk) throw new DeskError("Desk not found.");
  const set: Partial<typeof desks.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new DeskError("Desk name is required.");
    set.name = name;
  }
  if (patch.color) set.color = patch.color;
  if (Object.keys(set).length === 0) return;
  await db.update(desks).set(set).where(and(eq(desks.id, id), eq(desks.orgId, orgId)));
}

/** Delete a desk. Refuses if it still holds leads, or if it's the last desk. */
export async function deleteDesk(id: string, orgId: string): Promise<void> {
  const all = await listDesks(orgId);
  if (all.length <= 1) throw new DeskError("Keep at least one desk.");
  const held = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), eq(leads.deskId, id)));
  if (Number(held[0]?.c ?? 0) > 0)
    throw new DeskError("Move the leads on this desk elsewhere before deleting it.");
  await db.delete(desks).where(and(eq(desks.id, id), eq(desks.orgId, orgId)));
}

/** Swap a desk's position with its neighbour (reorder left/right). */
export async function moveDesk(
  id: string,
  orgId: string,
  dir: "up" | "down",
): Promise<void> {
  const all = await listDesks(orgId);
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return;
  const swapWith = dir === "up" ? all[idx - 1] : all[idx + 1];
  if (!swapWith) return;
  const me = all[idx];
  await db.update(desks).set({ position: swapWith.position }).where(eq(desks.id, me.id));
  await db.update(desks).set({ position: me.position }).where(eq(desks.id, swapWith.id));
}

/**
 * Move a lead to a handling desk. Logs a `desk_change` activity (skipped when
 * `silent`, e.g. during a richer transfer that logs its own entry).
 */
export async function setLeadDesk(
  leadId: string,
  orgId: string,
  deskId: string,
  actor: LeadActor,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const desk = await getDesk(deskId, orgId);
  if (!desk) throw new DeskError("Invalid desk.");
  const before = await db
    .select({ deskId: leads.deskId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (before.length === 0) throw new DeskError("Lead not found.");
  if (before[0].deskId === deskId) return;

  await db
    .update(leads)
    .set({ deskId, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));

  if (!opts.silent) {
    await db.insert(leadActivities).values({
      id: nanoid(21),
      orgId,
      leadId,
      userId: actor.userId,
      actorName: actor.name,
      kind: "desk_change",
      body: `Moved to ${desk.name} desk`,
    });
  }
}
