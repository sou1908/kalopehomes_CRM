import "server-only";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { leads, leadActivities } from "./db/schema";

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

/**
 * Write the rows to a JSON file before deleting them, so an accidental wipe is
 * recoverable.
 *
 * Under SQLite this used `VACUUM INTO`, which copied the whole database file.
 * MySQL has no equivalent that a web process can call, and shelling out to
 * mysqldump would depend on a binary the host may not have. Exporting the rows
 * we are about to destroy is both portable and enough: nothing else is touched.
 */
async function snapshot(orgId: string): Promise<string> {
  const rows = await db.select().from(leads).where(eq(leads.orgId, orgId));
  const activity = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.orgId, orgId));

  const dir = path.join(process.cwd(), "data", "backups");
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `before-wipe-${stamp}.json`);
  await fs.promises.writeFile(
    file,
    JSON.stringify({ savedAt: new Date().toISOString(), orgId, leads: rows, activity }, null, 2),
    "utf8",
  );
  return file;
}

export async function deleteAllLeads(
  orgId: string,
): Promise<{ deleted: number; backup: string }> {
  const before = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.orgId, orgId));

  const backup = await snapshot(orgId);
  await db.delete(leads).where(eq(leads.orgId, orgId));

  return { deleted: before.length, backup };
}
