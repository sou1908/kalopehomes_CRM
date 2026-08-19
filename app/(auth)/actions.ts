"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, destroySession, verifyPassword, getCurrentUser } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/bootstrap";
import { getUserRoles, defaultSurface } from "@/lib/roles";
import { setPresence } from "@/lib/presence";

export type ActionState = { error?: string } | undefined;

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await ensureAdminUser();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const row = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (row.length === 0) return { error: "Invalid email or password." };
  // Client accounts use a magic link, not a password — their stored hash is a
  // sentinel, never a real bcrypt hash ($2…). Reject without leaking which is which.
  if (!row[0].passwordHash.startsWith("$2"))
    return { error: "Invalid email or password." };
  const ok = await verifyPassword(password, row[0].passwordHash);
  if (!ok) return { error: "Invalid email or password." };

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
