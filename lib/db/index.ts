import "server-only";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

/**
 * MySQL, via mysql2 — chosen because it is pure JavaScript.
 *
 * This app previously used SQLite through better-sqlite3, which is a native
 * C++ addon. That works on a laptop and on a VPS, but not on CloudLinux shared
 * hosting: the prebuilt binary needs a newer glibc than the box has, and there
 * is no compiler installed to build one. Nothing in package.json may require a
 * build step, or deployment fails at `npm install`.
 */

/**
 * What's missing from the configuration, or null when it's complete.
 *
 * Reported rather than thrown at import time. `next build` imports every route
 * to collect page data, so throwing here would make the build itself require a
 * reachable database — and on a managed host the build step does not always see
 * the environment variables the running app does. A misconfigured app should
 * fail on its first query with a clear message, not fail to build.
 */
function configError(): string | null {
  if (process.env.DATABASE_URL) return null;
  const missing = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"].filter(
    (k) => !process.env[k],
  );
  if (missing.length === 0) return null;
  return (
    `Database is not configured — missing ${missing.join(", ")}. ` +
    "Set DATABASE_URL, or MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER and " +
    "MYSQL_PASSWORD. See .env.example."
  );
}

function poolConfig(): mysql.PoolOptions {
  const url = process.env.DATABASE_URL;
  const base: mysql.PoolOptions = {
    // Shared hosting closes idle connections aggressively; without keepalive
    // the first request after a quiet spell fails on a dead socket.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 5),
    charset: "utf8mb4",
    // Statements are sent one at a time. Turning this on would let a single
    // injected string carry a second statement.
    multipleStatements: false,
  };

  if (url) return { ...base, uri: url };

  // Blanks are fine here: createPool does not connect, so an unconfigured
  // import stays harmless. ensureSchema() is where it becomes an error.
  return {
    ...base,
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "",
    password: process.env.MYSQL_PASSWORD ?? "",
    database: process.env.MYSQL_DATABASE ?? "",
  };
}

const pool = mysql.createPool(poolConfig());

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };

/** The connection pool, for maintenance work that Drizzle doesn't cover. */
export { pool };

/**
 * The tables, in dependency order — a foreign key cannot point at a table that
 * does not exist yet.
 *
 * Every index is declared inline. MySQL has no `CREATE INDEX IF NOT EXISTS`,
 * so a separate statement would throw on the second boot; inside the table
 * definition, `CREATE TABLE IF NOT EXISTS` covers the indexes too.
 *
 * No column has a DEFAULT that calls a function, and no TEXT column has a
 * DEFAULT at all — both need MySQL 8.0.13+, and the host's version is not ours
 * to choose. Those values come from the application (see schema.ts).
 */
const TABLES: Array<[string, string]> = [
  [
    "organizations",
    `CREATE TABLE IF NOT EXISTS organizations (
      id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(191) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_organizations_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "users",
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NULL,
      email VARCHAR(191) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      last_notifications_read_at BIGINT NULL,
      presence VARCHAR(16) NOT NULL DEFAULT 'offline',
      presence_updated_at BIGINT NULL,
      last_chat_read_at BIGINT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_org (org_id),
      CONSTRAINT fk_users_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "user_roles",
    `CREATE TABLE IF NOT EXISTS user_roles (
      id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      role VARCHAR(32) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_roles (user_id, role),
      CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "sessions",
    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      expires_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_sessions_user (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "todos",
    `CREATE TABLE IF NOT EXISTS todos (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NULL,
      user_id VARCHAR(32) NOT NULL,
      creator_user_id VARCHAR(32) NULL,
      title VARCHAR(500) NOT NULL,
      notes TEXT NOT NULL,
      done TINYINT(1) NOT NULL DEFAULT 0,
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      due_date BIGINT NULL,
      remind_at BIGINT NULL,
      attachments TEXT NOT NULL,
      sort_order DOUBLE NULL,
      created_at BIGINT NOT NULL,
      completed_at BIGINT NULL,
      PRIMARY KEY (id),
      KEY idx_todos_user (user_id),
      KEY idx_todos_org (org_id),
      KEY idx_todos_creator (creator_user_id),
      CONSTRAINT fk_todos_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_todos_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_todos_creator FOREIGN KEY (creator_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "notifications",
    `CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(500) NOT NULL,
      body TEXT NULL,
      link VARCHAR(500) NULL,
      actor_name VARCHAR(255) NULL,
      read_at BIGINT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_notifications_user (user_id, read_at),
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "chat_messages",
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NULL,
      recipient_user_id VARCHAR(32) NULL,
      author_name VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_chat_org_created (org_id, created_at),
      KEY idx_chat_user (user_id),
      KEY idx_chat_recipient (recipient_user_id),
      CONSTRAINT fk_chat_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_chat_recipient FOREIGN KEY (recipient_user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "dm_reads",
    `CREATE TABLE IF NOT EXISTS dm_reads (
      user_id VARCHAR(32) NOT NULL,
      peer_user_id VARCHAR(32) NOT NULL,
      last_read_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, peer_user_id),
      KEY idx_dm_reads_peer (peer_user_id),
      CONSTRAINT fk_dm_reads_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_dm_reads_peer FOREIGN KEY (peer_user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "pipelines",
    `CREATE TABLE IF NOT EXISTS pipelines (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(32) NOT NULL DEFAULT '#6a89a8',
      position INT NOT NULL DEFAULT 0,
      roles TEXT NOT NULL,
      fields TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_pipelines_org (org_id, position),
      CONSTRAINT fk_pipelines_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_stages",
    `CREATE TABLE IF NOT EXISTS lead_stages (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      pipeline_id VARCHAR(32) NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(32) NOT NULL DEFAULT '#6a89a8',
      kind VARCHAR(16) NOT NULL DEFAULT 'open',
      position INT NOT NULL DEFAULT 0,
      probability INT NULL,
      is_exit TINYINT(1) NOT NULL DEFAULT 0,
      fields TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_lead_stages_org (org_id, position),
      KEY idx_lead_stages_pipeline (pipeline_id, position),
      CONSTRAINT fk_lead_stages_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_lead_stages_pipeline FOREIGN KEY (pipeline_id)
        REFERENCES pipelines(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "leads",
    `CREATE TABLE IF NOT EXISTS leads (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      created_by_user_id VARCHAR(32) NULL,
      owner_user_id VARCHAR(32) NULL,
      name VARCHAR(255) NOT NULL,
      company VARCHAR(255) NULL,
      email VARCHAR(191) NULL,
      phone VARCHAR(32) NULL,
      source VARCHAR(128) NULL,
      purpose VARCHAR(255) NULL,
      stage VARCHAR(64) NOT NULL DEFAULT 'new',
      stage_id VARCHAR(32) NULL,
      estimated_value INT NULL,
      follow_up_at BIGINT NULL,
      address VARCHAR(500) NULL,
      city VARCHAR(128) NULL,
      state VARCHAR(128) NULL,
      pincode VARCHAR(16) NULL,
      country VARCHAR(128) NULL,
      notes TEXT NOT NULL,
      pipeline_id VARCHAR(32) NULL,
      journey TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_leads_org (org_id),
      KEY idx_leads_stage (stage_id),
      KEY idx_leads_pipeline (pipeline_id),
      KEY idx_leads_owner (owner_user_id),
      KEY idx_leads_creator (created_by_user_id),
      KEY idx_leads_follow_up (org_id, follow_up_at),
      KEY idx_leads_phone (phone),
      CONSTRAINT fk_leads_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_leads_creator FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_leads_owner FOREIGN KEY (owner_user_id)
        REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_leads_stage FOREIGN KEY (stage_id)
        REFERENCES lead_stages(id) ON DELETE SET NULL,
      CONSTRAINT fk_leads_pipeline FOREIGN KEY (pipeline_id)
        REFERENCES pipelines(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_assignees",
    `CREATE TABLE IF NOT EXISTS lead_assignees (
      lead_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      added_by_user_id VARCHAR(32) NULL,
      added_at BIGINT NOT NULL,
      PRIMARY KEY (lead_id, user_id),
      KEY idx_lead_assignees_user (user_id),
      KEY idx_lead_assignees_adder (added_by_user_id),
      CONSTRAINT fk_lead_assignees_lead FOREIGN KEY (lead_id)
        REFERENCES leads(id) ON DELETE CASCADE,
      CONSTRAINT fk_lead_assignees_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_lead_assignees_adder FOREIGN KEY (added_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_pipeline_history",
    `CREATE TABLE IF NOT EXISTS lead_pipeline_history (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      lead_id VARCHAR(32) NOT NULL,
      pipeline_id VARCHAR(32) NULL,
      stage_id VARCHAR(32) NULL,
      by_user_id VARCHAR(32) NULL,
      completed_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_lph_lead (lead_id),
      KEY idx_lph_pipeline (pipeline_id),
      KEY idx_lph_org (org_id),
      KEY idx_lph_stage (stage_id),
      KEY idx_lph_user (by_user_id),
      CONSTRAINT fk_lph_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_lph_lead FOREIGN KEY (lead_id)
        REFERENCES leads(id) ON DELETE CASCADE,
      CONSTRAINT fk_lph_pipeline FOREIGN KEY (pipeline_id)
        REFERENCES pipelines(id) ON DELETE CASCADE,
      CONSTRAINT fk_lph_stage FOREIGN KEY (stage_id)
        REFERENCES lead_stages(id) ON DELETE SET NULL,
      CONSTRAINT fk_lph_user FOREIGN KEY (by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_tags",
    `CREATE TABLE IF NOT EXISTS lead_tags (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(32) NOT NULL DEFAULT '#6a89a8',
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_lead_tags_org (org_id),
      CONSTRAINT fk_lead_tags_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_tag_links",
    `CREATE TABLE IF NOT EXISTS lead_tag_links (
      lead_id VARCHAR(32) NOT NULL,
      tag_id VARCHAR(32) NOT NULL,
      PRIMARY KEY (lead_id, tag_id),
      KEY idx_lead_tag_links_tag (tag_id),
      CONSTRAINT fk_ltl_lead FOREIGN KEY (lead_id)
        REFERENCES leads(id) ON DELETE CASCADE,
      CONSTRAINT fk_ltl_tag FOREIGN KEY (tag_id)
        REFERENCES lead_tags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "lead_activities",
    `CREATE TABLE IF NOT EXISTS lead_activities (
      id VARCHAR(32) NOT NULL,
      org_id VARCHAR(32) NOT NULL,
      lead_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NULL,
      actor_name VARCHAR(255) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      outcome VARCHAR(64) NULL,
      visibility VARCHAR(16) NOT NULL DEFAULT 'public',
      body TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      KEY idx_lead_activities_lead (lead_id, created_at),
      KEY idx_lead_activities_org (org_id),
      KEY idx_lead_activities_user (user_id),
      CONSTRAINT fk_la_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE,
      CONSTRAINT fk_la_lead FOREIGN KEY (lead_id)
        REFERENCES leads(id) ON DELETE CASCADE,
      CONSTRAINT fk_la_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  [
    "digest_state",
    `CREATE TABLE IF NOT EXISTS digest_state (
      org_id VARCHAR(32) NOT NULL,
      last_run_date VARCHAR(10) NULL,
      PRIMARY KEY (org_id),
      CONSTRAINT fk_digest_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
];

let schemaPromise: Promise<void> | null = null;

/**
 * Create any missing tables. Safe to call on every request — the work happens
 * once per process and every later caller awaits the same promise.
 *
 * Under SQLite this ran synchronously at import time. MySQL is asynchronous, so
 * it cannot: everything that touches the database has to await this first.
 * `ensureAdminUser()` in lib/bootstrap.ts does exactly that, and `getCurrentUser()`
 * awaits that in turn, which covers every page and every server action.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const bad = configError();
      if (bad) throw new Error(bad);

      for (const [name, ddl] of TABLES) {
        try {
          await pool.query(ddl);
        } catch (err) {
          console.error(`[migrate] creating ${name} failed:`, err);
          throw err;
        }
      }

      // Sessions that have already expired can never authenticate anyone again,
      // but they sit in the table as valid-looking tokens and grow it without
      // bound. Cleared at boot, which costs nothing.
      try {
        await pool.query(
          `DELETE FROM sessions WHERE expires_at < (UNIX_TIMESTAMP() * 1000)`,
        );
      } catch {
        // A failure here is housekeeping, not correctness — never block boot.
      }
    })().catch((err) => {
      // Let the next request retry rather than caching a failed connection
      // attempt for the life of the process.
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}
