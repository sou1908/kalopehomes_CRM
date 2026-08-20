import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Reports whether the app can reach its database, and if not, at which step it
 * failed.
 *
 * Deliberately open, because it exists for the case where nobody can log in —
 * gating it behind a login, or behind an environment variable, would make it
 * useless in exactly the situation it is for.
 *
 * It therefore says only which step failed and the driver's error code
 * (ER_ACCESS_DENIED_ERROR, ER_BAD_DB_ERROR …). Never a hostname, a username, a
 * password, or a raw driver message, any of which can carry the connection
 * details. The full error goes to the server log, where it is private.
 */

/** Codes worth translating; anything else is returned as-is. */
const EXPLANATIONS: Record<string, string> = {
  ER_ACCESS_DENIED_ERROR: "The database username or password is wrong.",
  ER_BAD_DB_ERROR: "That database does not exist — create it in the hosting panel.",
  ER_DBACCESS_DENIED_ERROR: "The user exists but has no rights on that database.",
  ECONNREFUSED: "Nothing is listening on that host and port.",
  ENOTFOUND: "The database hostname does not resolve.",
  ETIMEDOUT: "The database did not answer — usually a firewall or a wrong host.",
  PROTOCOL_CONNECTION_LOST: "The connection was closed by the server.",
  ER_NOT_SUPPORTED_AUTH_MODE: "The server wants an authentication mode the driver refused.",
  ER_TOO_MANY_USER_CONNECTIONS: "The account is at its connection limit.",
  ER_PARSE_ERROR: "The server rejected our SQL — likely an older MySQL or MariaDB.",
};

function describe(err: unknown): { code: string; hint: string } {
  const e = err as { code?: string; errno?: number; message?: string };
  const code = e?.code ?? (e?.errno ? `errno ${e.errno}` : "UNKNOWN");
  return { code, hint: EXPLANATIONS[code] ?? "See the server log for the full error." };
}

/**
 * What MySQL itself said about the refusal, reduced to two booleans.
 *
 * The driver's message reads:
 *   Access denied for user 'name'@'10.1.2.3' (using password: YES)
 *
 * The host in that string is the address MySQL saw the connection arrive from,
 * which is the one fact that separates "the password is wrong" from "this user
 * is not granted access from that machine" — a grant is per host, so a user
 * that works in phpMyAdmin can still be refused from an app container.
 *
 * Reported as classifications, never as the address or the username.
 */
function refusalDetail(err: unknown): {
  sentPassword: boolean | null;
  serverSawLoopbackClient: boolean | null;
} {
  const message = (err as { message?: string })?.message ?? "";
  const usingPassword = /using password:\s*(YES|NO)/i.exec(message);
  const at = /@'([^']*)'/.exec(message);
  const host = at?.[1] ?? null;

  return {
    sentPassword: usingPassword ? usingPassword[1].toUpperCase() === "YES" : null,
    serverSawLoopbackClient:
      host === null
        ? null
        : host === "localhost" || host === "127.0.0.1" || host === "::1",
  };
}

/**
 * Structural facts about the credentials, for when the server rejects them.
 *
 * Shapes only — never a username, a password, or a hostname. On shared hosting
 * the account prefix (u550926335_) belongs on BOTH the database and the user,
 * and leaving it off one of them is the usual cause of an access-denied. So is
 * a stray space picked up when pasting a password.
 */
function credentialShape() {
  const user = process.env.MYSQL_USER ?? "";
  const database = process.env.MYSQL_DATABASE ?? "";
  const password = process.env.MYSQL_PASSWORD ?? "";
  const host = process.env.MYSQL_HOST ?? "";
  const prefix = (s: string) => /^(u\d+_)/.exec(s)?.[1] ?? null;

  return {
    userIsPrefixed: prefix(user) !== null,
    databaseIsPrefixed: prefix(database) !== null,
    // Both must carry the SAME account prefix.
    prefixesMatch: prefix(user) !== null && prefix(user) === prefix(database),
    passwordLength: password.length,
    // A pasted value that kept a leading or trailing space fails every time,
    // and looks completely correct in a masked field.
    passwordHasEdgeSpace: password !== password.trim(),
    userHasEdgeSpace: user !== user.trim(),
    databaseHasEdgeSpace: database !== database.trim(),
    hostIsLocal: host === "localhost" || host === "127.0.0.1",
    usingDatabaseUrl: Boolean(process.env.DATABASE_URL),
  };
}

export async function GET() {
  // 1. Is it configured at all? Names only — never the values.
  const configured = Boolean(
    process.env.DATABASE_URL ||
      (process.env.MYSQL_HOST && process.env.MYSQL_DATABASE && process.env.MYSQL_USER),
  );
  if (!configured) {
    const missing = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER"].filter(
      (k) => !process.env[k],
    );
    return NextResponse.json(
      {
        ok: false,
        step: "config",
        missing,
        hint: "Set these in the hosting panel's environment variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  // 2. Can we actually talk to it?
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    console.error("[health] connect failed:", err);
    return NextResponse.json(
      {
        ok: false,
        step: "connect",
        ...describe(err),
        server: refusalDetail(err),
        checks: credentialShape(),
      },
      { status: 503 },
    );
  }

  // 3. Do the tables exist / can we create them?
  try {
    await ensureSchema();
  } catch (err) {
    console.error("[health] schema failed:", err);
    return NextResponse.json({ ok: false, step: "schema", ...describe(err) }, { status: 503 });
  }

  // 4. Report what's there, so "it works but is empty" is distinguishable.
  try {
    // The mysql2 driver hands back [rows, fields]; only the rows matter here.
    const rows = async (q: ReturnType<typeof sql>) => {
      const res = (await db.execute(q)) as unknown as [
        Array<Record<string, unknown>>,
        unknown,
      ];
      return res[0] ?? [];
    };
    const [v] = await rows(sql`SELECT VERSION() AS version`);
    const [c] = await rows(
      sql`SELECT
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM leads) AS leads,
            (SELECT COUNT(*) FROM pipelines) AS pipelines`,
    );
    return NextResponse.json({
      ok: true,
      mysql: String(v?.version ?? "unknown"),
      users: Number(c?.users ?? 0),
      leads: Number(c?.leads ?? 0),
      pipelines: Number(c?.pipelines ?? 0),
    });
  } catch (err) {
    console.error("[health] counts failed:", err);
    return NextResponse.json({ ok: false, step: "query", ...describe(err) }, { status: 503 });
  }
}
