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

  CREATE TABLE IF NOT EXISTS desks (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6a89a8',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_desks_org ON desks(org_id);

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
  // Handling desk (Telecalling → Site Visit → Manager).
  ["leads", "desk_id TEXT REFERENCES desks(id) ON DELETE SET NULL"],
  // [PROTOTYPE] Per-desk journey/milestone data (JSON).
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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_leads_desk ON leads(desk_id);`);
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

// Role rename migration: the old `lead_manager` worker role is now `telecaller`
// (the top role is `super_admin`, relabelled "Lead Manager" in the UI). Convert
// any existing rows so previously-created managers become telecallers. Idempotent.
try {
  sqlite.exec(`UPDATE user_roles SET role = 'telecaller' WHERE role = 'lead_manager';`);
} catch {}

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
