import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import {
  leads,
  leadStages,
  users,
  userRoles,
  digestState,
} from "./db/schema";
import { createNotification } from "./notifications";

type Bucket = { overdue: number; today: number };

function todayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function summarise(b: Bucket): string {
  const parts: string[] = [];
  if (b.overdue > 0) parts.push(`${b.overdue} overdue`);
  if (b.today > 0) parts.push(`${b.today} due today`);
  return parts.join(" · ");
}

/**
 * Send the daily follow-up nudge for one org, at most once per calendar day.
 * Each lead owner gets one inbox notification summarising their overdue/due-today
 * follow-ups; super admins additionally get one for unassigned due leads.
 * Returns whether it actually ran (false = already done today / nothing due).
 */
export async function runFollowUpDigest(
  orgId: string,
  opts: { force?: boolean } = {},
): Promise<{ ran: boolean; notified: number }> {
  const now = new Date();
  const key = todayKey(now);

  if (!opts.force) {
    const state = await db
      .select({ last: digestState.lastRunDate })
      .from(digestState)
      .where(eq(digestState.orgId, orgId))
      .limit(1);
    if (state[0]?.last === key) return { ran: false, notified: 0 };
  }

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

  const stages = await db
    .select({ id: leadStages.id, kind: leadStages.kind })
    .from(leadStages)
    .where(eq(leadStages.orgId, orgId));
  const openStageIds = new Set(
    stages.filter((s) => s.kind === "open").map((s) => s.id),
  );

  const rows = await db
    .select({
      ownerUserId: leads.ownerUserId,
      stageId: leads.stageId,
      followUpAt: leads.followUpAt,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), isNotNull(leads.followUpAt)));

  // Group due/overdue open leads by owner ("" = unassigned).
  const byOwner = new Map<string, Bucket>();
  for (const r of rows) {
    // Leads with no stage count as open (consistent with the board/sidebar).
    const open = r.stageId ? openStageIds.has(r.stageId) : true;
    if (!open || !r.followUpAt) continue;
    const t = r.followUpAt.getTime();
    if (t >= endOfToday) continue; // due later — not yet
    const owner = r.ownerUserId ?? "";
    const b = byOwner.get(owner) ?? { overdue: 0, today: 0 };
    if (t < startOfToday) b.overdue += 1;
    else b.today += 1;
    byOwner.set(owner, b);
  }

  let notified = 0;

  for (const [owner, bucket] of byOwner) {
    if (bucket.overdue + bucket.today === 0) continue;
    const summary = summarise(bucket);

    if (owner) {
      await createNotification({
        userId: owner,
        type: "followup_digest",
        title: "Your follow-ups need attention",
        body: summary,
        link: "/leads/all?owner=me&filter=attention",
      });
      notified += 1;
    } else {
      // Unassigned due leads → nudge every super admin.
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(users.orgId, orgId), eq(userRoles.role, "super_admin")));
      for (const a of admins) {
        await createNotification({
          userId: a.id,
          type: "followup_digest",
          title: "Unassigned follow-ups need attention",
          body: summary,
          link: "/leads/all?filter=attention",
        });
        notified += 1;
      }
    }
  }

  // Mark today done (even if nothing was due — avoids re-scanning all day).
  await db
    .insert(digestState)
    .values({ orgId, lastRunDate: key })
    .onConflictDoUpdate({ target: digestState.orgId, set: { lastRunDate: key } });

  return { ran: true, notified };
}

/** Run the digest for every org (used by the cron route). */
export async function runFollowUpDigestAllOrgs(): Promise<{ notified: number }> {
  const orgs = await db.select({ id: digestState.orgId }).from(digestState);
  // digest_state may be empty on a fresh DB; fall back to scanning leads' orgs.
  const orgIds = new Set(orgs.map((o) => o.id));
  const leadOrgs = await db.select({ orgId: leads.orgId }).from(leads);
  for (const l of leadOrgs) orgIds.add(l.orgId);

  let notified = 0;
  for (const id of orgIds) {
    const r = await runFollowUpDigest(id);
    notified += r.notified;
  }
  return { notified };
}
