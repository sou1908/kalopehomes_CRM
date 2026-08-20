/**
 * Checks the database connection and reports what is wrong, in plain language.
 *
 *   npm run db:check
 *
 * Run this on the server before opening the site. A failure here is the whole
 * failure — if this passes, the app has everything it needs from MySQL.
 *
 * Standalone on purpose: it imports nothing from the app, so it still runs when
 * the app itself will not start.
 */
import fs from "node:fs";
import mysql from "mysql2/promise";

// Load .env.local if present, without adding a dependency. Values already in
// the real environment win, which is what a managed host provides.
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const EXPECTED = [
  "organizations", "users", "user_roles", "sessions", "todos",
  "notifications", "chat_messages", "dm_reads", "pipelines", "lead_stages",
  "leads", "lead_assignees", "lead_pipeline_history", "lead_tags",
  "lead_tag_links", "lead_activities", "digest_state",
];

function fail(message, hint) {
  console.error(`\n  FAILED: ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  const missing = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    fail(
      `these environment variables are not set: ${missing.join(", ")}`,
      "Set them in your host's environment panel (or .env.local locally). See .env.example.",
    );
  }
}

const target = url
  ? url.replace(/:[^:@/]*@/, ":***@")
  : `${process.env.MYSQL_USER}@${process.env.MYSQL_HOST}:${
      process.env.MYSQL_PORT ?? 3306
    }/${process.env.MYSQL_DATABASE}`;

console.log(`\n  Connecting to ${target}`);

let conn;
try {
  conn = url
    ? await mysql.createConnection(url)
    : await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT ?? 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD ?? "",
        database: process.env.MYSQL_DATABASE,
        connectTimeout: 10_000,
      });
} catch (err) {
  const code = err?.code ?? "";
  const hints = {
    ER_ACCESS_DENIED_ERROR: "The username or password is wrong.",
    ER_BAD_DB_ERROR:
      "That database does not exist yet — create it in the hosting panel first.",
    ECONNREFUSED:
      "Nothing is listening there. Check the host and port; on shared hosting the host is usually 'localhost'.",
    ETIMEDOUT:
      "No answer. If you are running this from your own machine against the host's MySQL, remote access is probably blocked — run it on the server instead.",
    ENOTFOUND: "That hostname does not resolve. Check MYSQL_HOST for a typo.",
  };
  fail(`could not connect (${code || err?.message})`, hints[code]);
}

const [[ver]] = await conn.query(
  "SELECT VERSION() AS version, DATABASE() AS db, @@character_set_database AS charset",
);
console.log(`  Connected. MySQL ${ver.version}, database "${ver.db}", charset ${ver.charset}`);

if (!/^utf8mb4/.test(ver.charset ?? "")) {
  console.log(
    `\n  WARNING: charset is ${ver.charset}, not utf8mb4. Names with accents or\n` +
      "  emoji may not store correctly. The app's own tables set utf8mb4 explicitly,\n" +
      "  so this is a warning rather than a failure.",
  );
}

const [rows] = await conn.query(
  "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()",
);
const present = new Set(rows.map((r) => r.t ?? r.TABLE_NAME));
const missing = EXPECTED.filter((t) => !present.has(t));

console.log(`\n  Tables: ${EXPECTED.length - missing.length} of ${EXPECTED.length} present`);
if (missing.length === EXPECTED.length) {
  console.log("  None yet — they are created the first time the app starts. That is normal");
  console.log("  before the first run.");
} else if (missing.length) {
  console.log(`  Missing: ${missing.join(", ")}`);
  console.log("  Start the app once; if they are still missing, its log will say why.");
} else {
  const [[c]] = await conn.query("SELECT COUNT(*) AS n FROM leads");
  const [[u]] = await conn.query("SELECT COUNT(*) AS n FROM users");
  console.log(`  All present. ${u.n} user(s), ${c.n} lead(s).`);
}

// Writing is the permission that actually matters and is easy to get wrong.
try {
  await conn.query("CREATE TABLE IF NOT EXISTS _write_check (id INT PRIMARY KEY)");
  await conn.query("DROP TABLE _write_check");
  console.log("  Write permission: yes");
} catch (err) {
  fail(
    `the user can connect but cannot create tables (${err?.code ?? err?.message})`,
    "Grant this user full privileges on the database in the hosting panel.",
  );
}

await conn.end();
console.log("\n  All good.\n");
