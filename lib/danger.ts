import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./db";
import { leads } from "./db/schema";

/**
 * ⚠️ TEMPORARY — BUILT FOR TESTING, REMOVE BEFORE THE SITE GOES LIVE.
 *
 * Wipes every lead in an org. Activities, assignees, tags and pipeline history
 * go with them by foreign-key cascade.
 *
 * To remove: delete this file, `deleteAllLeadsAction` in app/leads/actions.ts,
 * app/leads/_components/danger-zone.tsx, and the <DangerZone/> block at the
 * bottom of app/leads/all/page.tsx. Nothing else depends on it.
 */

/** Snapshot the database first, so an accidental wipe is recoverable. */
function snapshot(): string {
  const dir = path.join(process.cwd(), "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const file = path.join(dir, `before-wipe-${stamp}.db`);
  // better-sqlite3's own backup — safe against a live connection, unlike a
  // plain file copy, which would miss anything still sitting in the WAL.
  sqlite.prepare("VACUUM INTO ?").run(file);
  return file;
}

export async function deleteAllLeads(
  orgId: string,
): Promise<{ deleted: number; backup: string }> {
  const before = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.orgId, orgId));

  const backup = snapshot();
  await db.delete(leads).where(eq(leads.orgId, orgId));

  return { deleted: before.length, backup };
}
