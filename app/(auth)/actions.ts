"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, destroySession, verifyPassword, getCurrentUser } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/bootstrap";
import { getUserRoles, defaultSurface } from "@/lib/roles";
import { setPresence } from "@/lib/presence";
import { checkRateLimit, recordFailure, clearRateLimit } from "@/lib/rate-limit";

export type ActionState = { error?: string } | undefined;

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await ensureAdminUser();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  // Counted per address, so one account being attacked can't lock out the rest
  // of the office — and so a wrong password five times in a row costs a wait
  // rather than opening the account to unlimited guessing.
  const limit = checkRateLimit(`login:${email}`);
  if (!limit.allowed) {
    return {
      error: `Too many failed attempts. Try again in ${limit.retryAfterMinutes} minute${
        limit.retryAfterMinutes === 1 ? "" : "s"
      }.`,
    };
  }

  const row = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Every miss counts the same and says the same thing, whatever went wrong.
  const fail = (): ActionState => {
    recordFailure(`login:${email}`);
    return { error: "Invalid email or password." };
  };

  if (row.length === 0) return fail();
  // Client accounts use a magic link, not a password — their stored hash is a
  // sentinel, never a real bcrypt hash ($2…). Reject without leaking which is which.
  if (!row[0].passwordHash.startsWith("$2")) return fail();
  const ok = await verifyPassword(password, row[0].passwordHash);
  if (!ok) return fail();

  clearRateLimit(`login:${email}`);
  await createSession(row[0].id);
  // Signing in marks the caller available to the team.
  await setPresence(row[0].id, "available");
  const roles = await getUserRoles(row[0].id);
  redirect(defaultSurface(roles));
}

export async function logoutAction() {
  // Mark offline before tearing down the session.
  const u = await getCurrentUser();
  if (u) await setPresence(u.id, "offline");
  await destroySession();
  redirect("/login");
}
