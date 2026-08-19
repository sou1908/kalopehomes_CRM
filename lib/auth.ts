import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, sessions } from "./db/schema";
import type { User, Role } from "./db/schema";
import { ensureAdminUser } from "./bootstrap";
import { getUserRoles } from "./roles";

const SESSION_COOKIE = "it_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const id = nanoid(40);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getCurrentUser() {
  await ensureAdminUser();
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const row = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sid))
    .limit(1);
  if (row.length === 0) return null;
  const { session, user } = row[0];
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sid));
    return null;
  }
  return user;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export type AuthedUser = User & { roles: Role[] };

/** Current user plus their stackable roles, or null if not signed in. */
export async function getCurrentUserWithRoles(): Promise<AuthedUser | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  const roles = await getUserRoles(u.id);
  return { ...u, roles };
}

/**
 * Require a signed-in user holding at least one of `allowed`. Returns the user
 * (with roles) or throws — callers in layouts should catch and redirect.
 */
export async function requireRole(allowed: Role[]): Promise<AuthedUser> {
  const u = await getCurrentUserWithRoles();
  if (!u) throw new Error("UNAUTHORIZED");
  if (!u.roles.some((r) => allowed.includes(r))) throw new Error("FORBIDDEN");
  return u;
}
