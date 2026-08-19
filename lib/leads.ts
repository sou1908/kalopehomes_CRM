import "server-only";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  leads,
  leadStages,
  leadTags,
  leadTagLinks,
  leadActivities,
} from "./db/schema";
import type { Lead, LeadStage, LeadTag, LeadActivity } from "./db/schema";
import type { LeadMention } from "./leads-shared";

export class LeadError extends Error {}

export type LeadActor = { userId: string; name: string };

export type LeadInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  purpose?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  stageId?: string | null;
  estimatedValue?: number | null;
  // `undefined` = leave unchanged on update; `null` = clear.
  followUpAt?: Date | null;
  notes?: string;
};

// ── Stages ────────────────────────────────────────────────────────────────

/** The org's pipeline stages, ordered left → right. */
export async function listLeadStages(orgId: string): Promise<LeadStage[]> {
  return db
    .select()
    .from(leadStages)
    .where(eq(leadStages.orgId, orgId))
    .orderBy(asc(leadStages.position), asc(leadStages.createdAt));
}

async function getStage(id: string, orgId: string): Promise<LeadStage | null> {
  const rows = await db
    .select()
    .from(leadStages)
    .where(and(eq(leadStages.id, id), eq(leadStages.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The stage a new lead lands in by default — the lowest-position stage. */
async function firstStageId(orgId: string): Promise<string | null> {
  const rows = await listLeadStages(orgId);
  return rows[0]?.id ?? null;
}

/** Add a custom 'open' stage, placed just after the last open stage. */
export async function createLeadStage(input: {
  orgId: string;
  name: string;
  color?: string;
  probability?: number | null;
}): Promise<LeadStage> {
  const name = input.name.trim();
  if (!name) throw new LeadError("Stage name is required.");

  // Sit new open stages after the last open one but before won/lost.
  const openRows = await db
    .select({ position: leadStages.position })
    .from(leadStages)
    .where(and(eq(leadStages.orgId, input.orgId), eq(leadStages.kind, "open")))
    .orderBy(desc(leadStages.position))
    .limit(1);
  const position = (openRows[0]?.position ?? 0) + 1;

  const id = nanoid(21);
  const row = {
    id,
    orgId: input.orgId,
    name,
    color: input.color || "#6a89a8",
    kind: "open" as const,
    position,
    probability: clampProb(input.probability) ?? 50,
  };
  await db.insert(leadStages).values(row);
  return { ...row, createdAt: new Date() } as LeadStage;
}

/** Rename / recolor a stage. Kind and org are never changed here. */
export async function updateLeadStage(
  id: string,
  orgId: string,
  data: { name?: string; color?: string; probability?: number | null },
): Promise<void> {
  const stage = await getStage(id, orgId);
  if (!stage) throw new LeadError("Stage not found.");
  const patch: Partial<LeadStage> = {};
  if (data.name != null) {
    const name = data.name.trim();
    if (!name) throw new LeadError("Stage name is required.");
    patch.name = name;
  }
  if (data.color) patch.color = data.color;
  if (data.probability !== undefined) patch.probability = clampProb(data.probability);
  if (Object.keys(patch).length === 0) return;
  await db
    .update(leadStages)
    .set(patch)
    .where(and(eq(leadStages.id, id), eq(leadStages.orgId, orgId)));
}

/**
 * Delete a custom stage. Won/Lost (terminal) stages can't be deleted, and a
 * stage that still holds leads can't either — move them first.
 */
export async function deleteLeadStage(id: string, orgId: string): Promise<void> {
  const stage = await getStage(id, orgId);
  if (!stage) throw new LeadError("Stage not found.");
  if (stage.kind !== "open")
    throw new LeadError("The Won and Lost stages can't be deleted.");

  const inUse = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(leads)
    .where(eq(leads.stageId, id));
  if ((inUse[0]?.c ?? 0) > 0)
    throw new LeadError(
      "This stage still has leads. Move them to another stage first.",
    );

  await db
    .delete(leadStages)
    .where(and(eq(leadStages.id, id), eq(leadStages.orgId, orgId)));
}

/** Swap an 'open' stage with its neighbour (direction: up = earlier). */
export async function moveLeadStage(
  id: string,
  orgId: string,
  direction: "up" | "down",
): Promise<void> {
  const open = (await listLeadStages(orgId)).filter((s) => s.kind === "open");
  const idx = open.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const swapWith = direction === "up" ? open[idx - 1] : open[idx + 1];
  if (!swapWith) return;
  const me = open[idx];
  await db
    .update(leadStages)
    .set({ position: swapWith.position })
    .where(eq(leadStages.id, me.id));
  await db
    .update(leadStages)
    .set({ position: me.position })
    .where(eq(leadStages.id, swapWith.id));
}

// ── Leads ─────────────────────────────────────────────────────────────────

/** All leads in an org, newest first. */
export async function listLeads(orgId: string): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(eq(leads.orgId, orgId))
    .orderBy(desc(leads.createdAt));
}

/**
 * Compact lead list for chat @mentions — open (ongoing) leads first. Used both
 * to power the picker and to resolve `[[lead:ID]]` chips back to a name.
 */
export async function listLeadMentions(orgId: string): Promise<LeadMention[]> {
  const [allLeads, stages] = await Promise.all([
    listLeads(orgId),
    listLeadStages(orgId),
  ]);
  const openStageIds = new Set(
    stages.filter((s) => s.kind === "open").map((s) => s.id),
  );
  return allLeads.map((l) => ({
    id: l.id,
    name: l.name,
    company: l.company,
    // No stage yet → treat as ongoing.
    open: l.stageId ? openStageIds.has(l.stageId) : true,
  }));
}

/** Leads currently sitting on a given handling desk (the desk's worklist). */
export async function listLeadsByDesk(
  orgId: string,
  deskId: string,
): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.orgId, orgId), eq(leads.deskId, deskId)))
    .orderBy(desc(leads.updatedAt));
}

/** A single lead, scoped to the org (returns null if not found / wrong org). */
export async function getLead(id: string, orgId: string): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Validate a stage id belongs to the org, else fall back to the first stage. */
async function resolveStageId(
  orgId: string,
  stageId: string | null | undefined,
): Promise<string | null> {
  if (stageId) {
    const s = await getStage(stageId, orgId);
    if (s) return s.id;
  }
  return firstStageId(orgId);
}

export async function createLead(input: {
  orgId: string;
  actor: LeadActor;
  data: LeadInput;
}): Promise<string> {
  const name = input.data.name.trim();
  if (!name) throw new LeadError("Lead name is required.");
  const stageId = await resolveStageId(input.orgId, input.data.stageId);

  const id = nanoid(21);
  await db.insert(leads).values({
    id,
    orgId: input.orgId,
    createdByUserId: input.actor.userId,
    name,
    company: clean(input.data.company),
    email: clean(input.data.email),
    phone: clean(input.data.phone),
    source: clean(input.data.source),
    purpose: clean(input.data.purpose),
    stageId,
    estimatedValue: normalizeValue(input.data.estimatedValue),
    followUpAt: input.data.followUpAt ?? null,
    address: clean(input.data.address),
    city: clean(input.data.city),
    state: clean(input.data.state),
    pincode: clean(input.data.pincode),
    country: clean(input.data.country),
    notes: input.data.notes?.trim() ?? "",
  });
  await logActivity({
    orgId: input.orgId,
    leadId: id,
    actor: input.actor,
    kind: "created",
    body: "Lead created",
  });
  return id;
}

/** Patch a lead's editable fields (org-scoped). Bumps updatedAt. */
export async function updateLead(
  id: string,
  orgId: string,
  data: LeadInput,
): Promise<void> {
  const existing = await getLead(id, orgId);
  if (!existing) throw new LeadError("Lead not found.");
  const name = data.name.trim();
  if (!name) throw new LeadError("Lead name is required.");

  const patch: Partial<typeof leads.$inferInsert> = {
    name,
    company: clean(data.company),
    email: clean(data.email),
    phone: clean(data.phone),
    source: clean(data.source),
    purpose: clean(data.purpose),
    address: clean(data.address),
    city: clean(data.city),
    state: clean(data.state),
    pincode: clean(data.pincode),
    country: clean(data.country),
    estimatedValue: normalizeValue(data.estimatedValue),
    notes: data.notes?.trim() ?? "",
    updatedAt: new Date(),
  };
  // Only touch the follow-up date when the caller explicitly provides it, so a
  // form that omits the field (e.g. the details editor) doesn't wipe it.
  if (data.followUpAt !== undefined) patch.followUpAt = data.followUpAt;

  await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
}

/** Move a lead to a new pipeline stage (org-scoped, stage validated). */
export async function setLeadStage(
  id: string,
  orgId: string,
  stageId: string,
  actor?: LeadActor,
): Promise<void> {
  const stage = await getStage(stageId, orgId);
  if (!stage) throw new LeadError("Invalid stage.");
  await db
    .update(leads)
    .set({ stageId, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
  if (actor) {
    await logActivity({
      orgId,
      leadId: id,
      actor,
      kind: "stage_change",
      body: `Moved to ${stage.name}`,
    });
  }
}

/** Set or clear only the follow-up date (org-scoped). */
export async function setLeadFollowUp(
  id: string,
  orgId: string,
  followUpAt: Date | null,
): Promise<void> {
  await db
    .update(leads)
    .set({ followUpAt, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
}

export async function deleteLead(id: string, orgId: string): Promise<void> {
  await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
}

// ── Activity log ────────────────────────────────────────────────────────────

export type ActivityKind = LeadActivity["kind"];

/** Append an entry to a lead's activity timeline. */
export async function logActivity(input: {
  orgId: string;
  leadId: string;
  actor: LeadActor;
  kind: ActivityKind;
  body?: string;
  outcome?: string | null;
  visibility?: "public" | "private";
}): Promise<void> {
  await db.insert(leadActivities).values({
    id: nanoid(21),
    orgId: input.orgId,
    leadId: input.leadId,
    userId: input.actor.userId,
    actorName: input.actor.name,
    kind: input.kind,
    outcome: input.outcome ?? null,
    visibility: input.visibility ?? "public",
    body: input.body?.trim() ?? "",
  });
}

/**
 * A lead's activity timeline, newest first. Private notes are only returned to
 * their author — pass the viewer's id so they see their own private notes.
 */
export async function listActivities(
  leadId: string,
  viewerId?: string,
): Promise<LeadActivity[]> {
  return db
    .select()
    .from(leadActivities)
    .where(
      and(
        eq(leadActivities.leadId, leadId),
        viewerId
          ? or(
              eq(leadActivities.visibility, "public"),
              eq(leadActivities.userId, viewerId),
            )
          : eq(leadActivities.visibility, "public"),
      ),
    )
    .orderBy(desc(leadActivities.createdAt));
}

type ActivityActor = { userId: string; isAdmin: boolean };

// Only manually-logged entries carry user text worth editing.
const EDITABLE_ACTIVITY_KINDS: ActivityKind[] = ["note", "call", "whatsapp", "meeting"];

/** Remove a timeline entry. Author or a Lead Manager (admin) only. */
export async function deleteActivity(
  id: string,
  orgId: string,
  actor: ActivityActor,
): Promise<void> {
  const rows = await db
    .select({ userId: leadActivities.userId })
    .from(leadActivities)
    .where(and(eq(leadActivities.id, id), eq(leadActivities.orgId, orgId)))
    .limit(1);
  if (rows.length === 0) return;
  if (!actor.isAdmin && rows[0].userId !== actor.userId)
    throw new LeadError("You can only remove your own entries.");
  await db
    .delete(leadActivities)
    .where(and(eq(leadActivities.id, id), eq(leadActivities.orgId, orgId)));
}

/** Edit the text of a manual entry (note/call/whatsapp/meeting). Author/admin only. */
export async function updateActivityBody(
  id: string,
  orgId: string,
  actor: ActivityActor,
  body: string,
): Promise<void> {
  const rows = await db
    .select({ userId: leadActivities.userId, kind: leadActivities.kind })
    .from(leadActivities)
    .where(and(eq(leadActivities.id, id), eq(leadActivities.orgId, orgId)))
    .limit(1);
  if (rows.length === 0) throw new LeadError("Entry not found.");
  if (!actor.isAdmin && rows[0].userId !== actor.userId)
    throw new LeadError("You can only edit your own entries.");
  if (!EDITABLE_ACTIVITY_KINDS.includes(rows[0].kind as ActivityKind))
    throw new LeadError("This entry can't be edited.");
  await db
    .update(leadActivities)
    .set({ body: body.trim() })
    .where(and(eq(leadActivities.id, id), eq(leadActivities.orgId, orgId)));
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function listLeadTags(orgId: string): Promise<LeadTag[]> {
  return db
    .select()
    .from(leadTags)
    .where(eq(leadTags.orgId, orgId))
    .orderBy(asc(leadTags.name));
}

export async function createLeadTag(input: {
  orgId: string;
  name: string;
  color?: string;
}): Promise<LeadTag> {
  const name = input.name.trim();
  if (!name) throw new LeadError("Tag name is required.");
  const id = nanoid(21);
  const row = {
    id,
    orgId: input.orgId,
    name,
    color: input.color || "#6a89a8",
  };
  await db.insert(leadTags).values(row);
  return { ...row, createdAt: new Date() } as LeadTag;
}

/** Rename / recolor a tag (org-scoped). Affects every lead carrying it. */
export async function updateLeadTag(
  id: string,
  orgId: string,
  data: { name?: string; color?: string },
): Promise<void> {
  const patch: Partial<typeof leadTags.$inferInsert> = {};
  if (data.name != null) {
    const n = data.name.trim();
    if (!n) throw new LeadError("Tag name is required.");
    patch.name = n;
  }
  if (data.color) patch.color = data.color;
  if (Object.keys(patch).length === 0) return;
  await db
    .update(leadTags)
    .set(patch)
    .where(and(eq(leadTags.id, id), eq(leadTags.orgId, orgId)));
}

/** Delete a tag (its links cascade off every lead). */
export async function deleteLeadTag(id: string, orgId: string): Promise<void> {
  await db.delete(leadTags).where(and(eq(leadTags.id, id), eq(leadTags.orgId, orgId)));
}

/** Replace a lead's tags with the given set (validated to the same org). */
export async function setLeadTags(
  leadId: string,
  orgId: string,
  tagIds: string[],
): Promise<void> {
  await db.delete(leadTagLinks).where(eq(leadTagLinks.leadId, leadId));
  if (tagIds.length === 0) return;
  const valid = await db
    .select({ id: leadTags.id })
    .from(leadTags)
    .where(and(eq(leadTags.orgId, orgId), inArray(leadTags.id, tagIds)));
  for (const t of valid) {
    await db.insert(leadTagLinks).values({ leadId, tagId: t.id });
  }
}

/** Tags for one lead. */
export async function tagsForLead(leadId: string): Promise<LeadTag[]> {
  return db
    .select({
      id: leadTags.id,
      orgId: leadTags.orgId,
      name: leadTags.name,
      color: leadTags.color,
      createdAt: leadTags.createdAt,
    })
    .from(leadTagLinks)
    .innerJoin(leadTags, eq(leadTags.id, leadTagLinks.tagId))
    .where(eq(leadTagLinks.leadId, leadId));
}

/** Tags grouped by lead id, for a batch of leads (board/list chips). */
export async function tagsForLeads(
  leadIds: string[],
): Promise<Map<string, LeadTag[]>> {
  const map = new Map<string, LeadTag[]>();
  if (leadIds.length === 0) return map;
  const rows = await db
    .select({
      leadId: leadTagLinks.leadId,
      id: leadTags.id,
      orgId: leadTags.orgId,
      name: leadTags.name,
      color: leadTags.color,
      createdAt: leadTags.createdAt,
    })
    .from(leadTagLinks)
    .innerJoin(leadTags, eq(leadTags.id, leadTagLinks.tagId))
    .where(inArray(leadTagLinks.leadId, leadIds));
  for (const r of rows) {
    const { leadId, ...tag } = r;
    const arr = map.get(leadId) ?? [];
    arr.push(tag as LeadTag);
    map.set(leadId, arr);
  }
  return map;
}

/** Lead ids carrying a given tag (for list-view filtering). */
export async function leadIdsWithTag(tagId: string): Promise<Set<string>> {
  const rows = await db
    .select({ leadId: leadTagLinks.leadId })
    .from(leadTagLinks)
    .where(eq(leadTagLinks.tagId, tagId));
  return new Set(rows.map((r) => r.leadId));
}

function clampProb(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}

function normalizeValue(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v);
}
