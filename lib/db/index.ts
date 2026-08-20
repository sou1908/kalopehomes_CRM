import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "./data/leadcrm.db";

const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ── Pre-DDL migration: desks → pipelines ───────────────────────────────────
// MUST run before the CREATE TABLE block below. If an empty `pipelines` table
// were created first, the rename would be skipped and every lead would lose
// which desk it was on. Guarded on both sides, so re-running is a no-op.
try {
  const tableNames = () =>
    (
      sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all() as Array<{ name: string }>
    ).map((t) => t.name);
  const leadColumns = () =>
    (sqlite.prepare(`PRAGMA table_info(leads)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    );

  let tables = tableNames();
  if (tables.includes("desks") && !tables.includes("pipelines")) {
    sqlite.exec(`ALTER TABLE desks RENAME TO pipelines;`);
    console.log("[migrate] desks → pipelines");
  }

  let cols = leadColumns();
  if (cols.includes("desk_id") && !cols.includes("pipeline_id")) {
    sqlite.exec(`ALTER TABLE leads RENAME COLUMN desk_id TO pipeline_id;`);
    console.log("[migrate] leads.desk_id → leads.pipeline_id");
  }

  // Clean up after a run that hit the old ordering bug: an empty `desks` table
  // and/or a stale `desk_id` column left beside the real ones. Only ever drops
  // the leftovers once `pipelines` is genuinely in place.
  tables = tableNames();
  cols = leadColumns();
  if (tables.includes("desks") && tables.includes("pipelines")) {
    const kept = (
      sqlite.prepare(`SELECT COUNT(*) AS c FROM pipelines`).get() as { c: number }
    ).c;
    if (kept > 0) {
      sqlite.exec(`DROP TABLE desks;`);
      console.log("[migrate] dropped leftover desks table");
    }
  }
  if (cols.includes("desk_id") && cols.includes("pipeline_id")) {
    // The old index references the column, and SQLite refuses to drop a column
    // an index still names. Drop the index first.
    sqlite.exec(`DROP INDEX IF EXISTS idx_leads_desk;`);
    sqlite.exec(`ALTER TABLE leads DROP COLUMN desk_id;`);
    console.log("[migrate] dropped leftover leads.desk_id");
  }
} catch (err) {
  console.error("[migrate] desks → pipelines failed:", err);
}

// Auto-migrate: create tables if they don't exist. Idempotent.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique ON user_roles(user_id, role);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    actor_name TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_org ON chat_messages(org_id, created_at);

  CREATE TABLE IF NOT EXISTS dm_reads (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (user_id, peer_user_id)
  );

  CREATE TABLE IF NOT EXISTS digest_state (
    org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    last_run_date TEXT
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    source TEXT,
    stage TEXT NOT NULL DEFAULT 'new',
    estimated_value INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(org_id);
  CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

  CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6a89a8',
    position INTEGER NOT NULL DEFAULT 0,
    roles TEXT NOT NULL DEFAULT '[]',
    fields TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_pipelines_org ON pipelines(org_id);

  CREATE TABLE IF NOT EXISTS lead_stages (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6a89a8',
    kind TEXT NOT NULL DEFAULT 'open',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_lead_stages_org ON lead_stages(org_id);

  CREATE TABLE IF NOT EXISTS lead_assignees (
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_primary INTEGER NOT NULL DEFAULT 0,
    added_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (lead_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lead_assignees_user ON lead_assignees(user_id);

  CREATE TABLE IF NOT EXISTS lead_tags (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6a89a8',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_lead_tags_org ON lead_tags(org_id);

  CREATE TABLE IF NOT EXISTS lead_tag_links (
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES lead_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (lead_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lead_tag_links_lead ON lead_tag_links(lead_id);

  CREATE TABLE IF NOT EXISTS lead_activities (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);
`);

// Idempotent column additions for upgrading existing databases. SQLite's
// CREATE TABLE IF NOT EXISTS doesn't add new columns, so we attempt each
// ALTER and swallow the "duplicate column" error when the column is present.
const addColumns: Array<[string, string]> = [
  ["users", "last_notifications_read_at INTEGER"],
  // Org seam: nullable REFERENCES is allowed via ALTER in SQLite (default NULL).
  ["users", "org_id TEXT REFERENCES organizations(id)"],
  // Caller availability presence + team-chat unread tracking on the user.
  ["users", "presence TEXT NOT NULL DEFAULT 'offline'"],
  ["users", "presence_updated_at INTEGER"],
  ["users", "last_chat_read_at INTEGER"],
  // Direct messages: a recipient turns a chat row into a 1:1 DM (null = team room).
  ["chat_messages", "recipient_user_id TEXT REFERENCES users(id) ON DELETE CASCADE"],
  // Lead ownership: the staff member a lead is assigned to.
  ["leads", "owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL"],
  // The pipeline a lead is currently worked in (was desk_id before the
  // 2026-08-19 redesign; the rename migration below handles existing rows).
  ["leads", "pipeline_id TEXT REFERENCES pipelines(id) ON DELETE SET NULL"],
  // [PROTOTYPE] Per-pipeline journey/milestone data (JSON).
  ["leads", "journey TEXT NOT NULL DEFAULT '{}'"],
  // User-definable lead pipeline stages: leads point at a lead_stages row.
  ["leads", "stage_id TEXT REFERENCES lead_stages(id)"],
  // CRM: follow-up reminders + structured address + purpose + per-stage win %.
  ["leads", "follow_up_at INTEGER"],
  ["leads", "address TEXT"],
  ["leads", "city TEXT"],
  ["leads", "state TEXT"],
  ["leads", "pincode TEXT"],
  ["leads", "country TEXT"],
  ["leads", "purpose TEXT"],
  ["lead_stages", "probability INTEGER"],
  ["lead_activities", "outcome TEXT"],
  ["lead_activities", "visibility TEXT NOT NULL DEFAULT 'public'"],
];
for (const [table, col] of addColumns) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col};`);
  } catch (err: any) {
    if (!/duplicate column/i.test(String(err?.message ?? ""))) throw err;
  }
}

try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);`);
} catch {}
try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON leads(stage_id);`);
} catch {}
try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_user_id);`);
} catch {}
try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(pipeline_id);`);
} catch {}
try {
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_dm ON chat_messages(org_id, recipient_user_id, user_id, created_at);`,
  );
} catch {}

// Migrate the single owner_user_id into a primary assignee row (one-time; only
// inserts when the lead isn't already in lead_assignees). Keeps the old owner
// working under the new multi-assignee model.
try {
  sqlite.exec(`
    INSERT OR IGNORE INTO lead_assignees (lead_id, user_id, is_primary, added_by_user_id, added_at)
    SELECT id, owner_user_id, 1, owner_user_id, updated_at
    FROM leads
    WHERE owner_user_id IS NOT NULL;
  `);
} catch {}

// ── Role migrations ────────────────────────────────────────────────────────
// The role set has been renamed twice. Both passes are idempotent and run
// before anything reads roles, so an existing admin never loses access.
//
//   lead_manager → telecaller     (2026-06, when the worker role was renamed)
//   super_admin  → admin          (2026-08, the four-role redesign)
//   field_agent  → site_agent     (2026-08)
//
// `UPDATE OR IGNORE` then `DELETE` handles the edge case where a user somehow
// holds both the old and the new role: the unique (user_id, role) index would
// reject a plain UPDATE and abort the whole migration, stranding the rename.
try {
  sqlite.exec(`
    UPDATE OR IGNORE user_roles SET role = 'telecaller' WHERE role = 'lead_manager';
    DELETE FROM user_roles WHERE role = 'lead_manager';

    UPDATE OR IGNORE user_roles SET role = 'admin' WHERE role = 'super_admin';
    DELETE FROM user_roles WHERE role = 'super_admin';

    UPDATE OR IGNORE user_roles SET role = 'site_agent' WHERE role = 'field_agent';
    DELETE FROM user_roles WHERE role = 'field_agent';

    -- Retired roles. This fork has no team workspace and no client portal, so
    -- these grant nothing; dropping them keeps the table honest.
    DELETE FROM user_roles WHERE role IN ('team_member', 'client');
  `);
} catch {}

// Safety net: if the org somehow ends up with no admin at all (a rename that
// half-applied on an older build, say), promote the earliest account so the
// CRM can always be administered. Without this a bad migration is unrecoverable
// through the UI.
try {
  const orphaned = sqlite
    .prepare(
      `SELECT u.org_id AS orgId, MIN(u.created_at) AS firstCreated
         FROM users u
        WHERE u.org_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_roles r
              JOIN users u2 ON u2.id = r.user_id
             WHERE u2.org_id = u.org_id AND r.role = 'admin'
          )
        GROUP BY u.org_id`,
    )
    .all() as Array<{ orgId: string; firstCreated: number }>;
  for (const row of orphaned) {
    const first = sqlite
      .prepare(
        `SELECT id FROM users WHERE org_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(row.orgId) as { id: string } | undefined;
    if (!first) continue;
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO user_roles (id, user_id, role) VALUES (?, ?, 'admin')`,
      )
      .run(`admin-${first.id}`.slice(0, 21), first.id);
  }
} catch {}

// ── Pipeline redesign, part 2 ──────────────────────────────────────────────
// (The desks → pipelines rename itself runs before the DDL, near the top of
// this file — it has to, or CREATE TABLE IF NOT EXISTS would create an empty
// `pipelines` first and the rename would be skipped, stranding every lead's
// desk assignment.)

// 3. New columns. Each ALTER is separate: SQLite has no "ADD COLUMN IF NOT
//    EXISTS", so a re-run throws on the ones already applied and the try/catch
//    per statement lets the rest still land.
for (const stmt of [
  `ALTER TABLE pipelines ADD COLUMN roles TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE pipelines ADD COLUMN fields TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE lead_stages ADD COLUMN pipeline_id TEXT REFERENCES pipelines(id) ON DELETE CASCADE`,
  `ALTER TABLE lead_stages ADD COLUMN is_exit INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE lead_stages ADD COLUMN probability INTEGER`,
  `ALTER TABLE lead_stages ADD COLUMN fields TEXT NOT NULL DEFAULT '[]'`,
]) {
  try {
    sqlite.exec(stmt);
  } catch {}
}

try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS lead_pipeline_history (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      pipeline_id TEXT REFERENCES pipelines(id) ON DELETE CASCADE,
      stage_id TEXT REFERENCES lead_stages(id) ON DELETE SET NULL,
      by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      completed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_lph_lead ON lead_pipeline_history(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lph_pipeline ON lead_pipeline_history(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_lead_stages_pipeline ON lead_stages(pipeline_id);
  `);
} catch (err) {
  console.error("[migrate] lead_pipeline_history failed:", err);
}

// 4. Attach existing org-wide stages to the FIRST pipeline. Before this change
//    stages were shared by everyone, and the first pipeline (Telecalling) is
//    where every lead already sat.
try {
  sqlite.exec(`
    UPDATE lead_stages
       SET pipeline_id = (
         SELECT p.id FROM pipelines p
          WHERE p.org_id = lead_stages.org_id
          ORDER BY p.position ASC LIMIT 1
       )
     WHERE pipeline_id IS NULL;
  `);
} catch (err) {
  console.error("[migrate] stage→pipeline backfill failed:", err);
}

// 5. One-time remap of the old shared sales stages onto the telecaller's own
//    vocabulary. The old set (New/Contacted/Qualified/Won/Lost) was one funnel
//    for everybody; the telecaller's pipeline now describes calling work, where
//    "Handed over" is the win. Renaming in place keeps every lead attached to
//    the row it already pointed at — no lead moves stage.
//
//    Scoped to the FIRST pipeline on purpose: Operations seeds its own stages
//    called Lost and Won, and an unscoped rename would rewrite those too on the
//    next boot. Idempotent — after it runs, none of the old names match there.
try {
  // "the first pipeline in this stage's org" — the one every lead already sat in.
  const inFirst =
    "pipeline_id = (SELECT p.id FROM pipelines p WHERE p.org_id = lead_stages.org_id ORDER BY p.position ASC LIMIT 1)";
  sqlite.exec(`
    UPDATE lead_stages SET position = 10 WHERE name = 'New' AND ${inFirst};
    -- 'Qualified' has no equivalent in the telecaller's vocabulary. Retire it,
    -- but never silently drop a stage that still holds leads.
    DELETE FROM lead_stages
      WHERE name = 'Qualified' AND ${inFirst}
        AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.stage_id = lead_stages.id);
    UPDATE lead_stages SET name = 'Interested',     position = 30  WHERE name = 'Contacted'  AND ${inFirst};
    UPDATE lead_stages SET name = 'Not interested', kind = 'lost', position = 90
      WHERE name = 'Lost' AND kind = 'lost' AND ${inFirst};
    UPDATE lead_stages SET name = 'Handed over', kind = 'won', position = 100, is_exit = 1
      WHERE name = 'Won' AND kind = 'won' AND ${inFirst};

    UPDATE pipelines SET name = 'Operations' WHERE name = 'Manager';

    UPDATE pipelines SET roles = '["telecaller"]'        WHERE name = 'Telecalling' AND roles = '[]';
    UPDATE pipelines SET roles = '["site_agent"]'        WHERE name = 'Site Visit'  AND roles = '[]';
    UPDATE pipelines SET roles = '["operation_manager"]' WHERE name = 'Operations'  AND roles = '[]';
  `);
} catch (err) {
  console.error("[migrate] stage remap failed:", err);
}

// 6. Remove duplicate stages within a pipeline, keeping the row that leads
//    actually point at (then the oldest). Bootstrap seeds stages per pipeline,
//    and two concurrent first requests could each decide a pipeline was empty
//    and seed it — this makes that self-healing rather than permanent.
try {
  sqlite.exec(`
    DELETE FROM lead_stages
     WHERE id NOT IN (
       SELECT keep_id FROM (
         SELECT s.id AS keep_id,
                ROW_NUMBER() OVER (
                  PARTITION BY s.pipeline_id, s.name
                  ORDER BY (SELECT COUNT(*) FROM leads l WHERE l.stage_id = s.id) DESC,
                           s.created_at ASC,
                           s.id ASC
                ) AS rn
           FROM lead_stages s
       ) WHERE rn = 1
     );
  `);
} catch (err) {
  console.error("[migrate] stage dedupe failed:", err);
}

// 7. Repair leads whose stage belongs to a different pipeline than the lead.
//    Moving a lead between pipelines used to leave its old stage behind, so it
//    landed on the new board still carrying the previous pipeline's stage. The
//    transition now moves the stage too; this fixes any left over, by dropping
//    them onto the first stage of the pipeline they're actually in.
try {
  sqlite.exec(`
    UPDATE leads
       SET stage_id = (
             SELECT s.id FROM lead_stages s
              WHERE s.pipeline_id = leads.pipeline_id
              ORDER BY s.position ASC LIMIT 1
           )
     WHERE pipeline_id IS NOT NULL
       AND stage_id IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM lead_stages s2
              WHERE s2.id = leads.stage_id
                AND s2.pipeline_id IS NOT NULL
                AND s2.pipeline_id <> leads.pipeline_id
           );
  `);
} catch (err) {
  console.error("[migrate] stage/pipeline repair failed:", err);
}

// 8. Backfill completed runs for leads that moved pipeline before the history
//    table was being written. A lead sitting in Site Visit must have passed
//    through Telecalling, so record that — otherwise the earlier pipeline's
//    board loses sight of work it actually did.
try {
  sqlite.exec(`
    INSERT INTO lead_pipeline_history (id, org_id, lead_id, pipeline_id, stage_id, completed_at)
    SELECT lower(hex(randomblob(10))), l.org_id, l.id, p.id, NULL, l.updated_at
      FROM leads l
      JOIN pipelines cur ON cur.id = l.pipeline_id
      JOIN pipelines p   ON p.org_id = l.org_id AND p.position < cur.position
     WHERE NOT EXISTS (
       SELECT 1 FROM lead_pipeline_history h
        WHERE h.lead_id = l.id AND h.pipeline_id = p.id
     );
  `);
} catch (err) {
  console.error("[migrate] pipeline history backfill failed:", err);
}

// 9. The Visited stage's questions grew — photos, measurements and what goes
//    where were added after it was first seeded. Bootstrap only fills stages
//    whose fields are empty, so a grown seed never reaches an existing org.
//
//    Keyed on the exact old set, so it fires once and can't touch a stage
//    someone has since changed. Idempotent: after it runs, nothing matches.
try {
  const OLD_VISITED =
    '[{"key":"office_visit","label":"Office visit too?","type":"yesno"},{"key":"office_at","label":"Office visit date & time","type":"datetime"},{"key":"visit_outcome","label":"How did it go?","type":"text"}]';
  const rows = sqlite
    .prepare(
      `SELECT s.id, s.fields FROM lead_stages s
         JOIN pipelines p ON p.id = s.pipeline_id
        WHERE s.name = 'Visited'`,
    )
    .all() as Array<{ id: string; fields: string }>;
  for (const row of rows) {
    if (row.fields.replace(/\s+/g, "") !== OLD_VISITED.replace(/\s+/g, "")) continue;
    sqlite
      .prepare(`UPDATE lead_stages SET fields = ? WHERE id = ?`)
      .run(
        JSON.stringify([
          {
            key: "photos",
            label: "Photos & video from the site",
            type: "files",
            hint: "What the room looks like now — the quotation gets built from these.",
          },
          {
            key: "measurements",
            label: "Measurements",
            type: "rows",
            hint: "One row per area. Kept as numbers so a quotation can be worked out from them.",
            columns: [
              { key: "area", label: "Area" },
              { key: "width", label: "Width", narrow: true },
              { key: "height", label: "Height", narrow: true },
              { key: "depth", label: "Depth", narrow: true },
              { key: "unit", label: "Unit", narrow: true, options: ["ft", "in", "mm", "m"] },
            ],
          },
          {
            key: "placement",
            label: "What goes where",
            type: "rows",
            hint: "The plan in the customer's words — north wall, tall unit; above sink, wall cabinets.",
            columns: [
              { key: "location", label: "Location" },
              { key: "item", label: "What goes there" },
            ],
          },
          { key: "office_visit", label: "Office visit too?", type: "yesno" },
          { key: "office_at", label: "Office visit date & time", type: "datetime" },
          { key: "visit_outcome", label: "How did it go?", type: "text" },
        ]),
        row.id,
      );
    console.log("[migrate] Visited stage questions updated");
  }
} catch (err) {
  console.error("[migrate] Visited fields update failed:", err);
}

// Shared to-do list (assignable). Created here (after users) with its own
// upgrade ALTERs so older DBs pick up the newer columns.
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date INTEGER,
      remind_at INTEGER,
      attachments TEXT NOT NULL DEFAULT '[]',
      sort_order REAL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
  `);
} catch {}
for (const col of [
  "notes TEXT NOT NULL DEFAULT ''",
  "remind_at INTEGER",
  "attachments TEXT NOT NULL DEFAULT '[]'",
  "creator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL",
]) {
  try {
    sqlite.exec(`ALTER TABLE todos ADD COLUMN ${col};`);
  } catch (err: any) {
    if (!/duplicate column/i.test(String(err?.message ?? ""))) throw err;
  }
}
// Existing to-dos are self-assigned: creator = assignee.
try {
  sqlite.exec(`UPDATE todos SET creator_user_id = user_id WHERE creator_user_id IS NULL;`);
} catch {}

export const db = drizzle(sqlite, { schema });
export { schema };

/** The underlying better-sqlite3 handle, for backups and PRAGMA work. */
export { sqlite };
