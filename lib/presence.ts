import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { users, userRoles } from "./db/schema";
import type { Role } from "./db/schema";
import type { Presence } from "./presence-shared";

export * from "./presence-shared";

export type TeamMemberPresence = {
  id: string;
  name: string;
  email: string;
  presence: Presence;
  presenceUpdatedAt: Date | null;
  roles: Role[];
};

/** Set a user's own availability. */
export async function setPresence(userId: string, presence: Presence): Promise<void> {
  await db
    .update(users)
    .set({ presence, presenceUpdatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Admin override: set another member's presence. Verifies the target belongs to
 * the same org before writing (callers must already be a admin).
 */
export async function setMemberPresence(
  orgId: string,
  userId: string,
  presence: Presence,
): Promise<void> {
  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (target.length === 0) return;
  await setPresence(userId, presence);
}

/**
 * Everyone on the team (staff accounts) with their presence + roles, for the
 * Team roster. Excludes client-only accounts.
 */
export async function listTeamPresence(orgId: string): Promise<TeamMemberPresence[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(desc(users.createdAt));

  const out: TeamMemberPresence[] = [];
  for (const u of rows) {
    const roleRows = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, u.id));
    const roles = roleRows.map((r) => r.role as Role);
    out.push({
      id: u.id,
      name: u.name,
      email: u.email,
      presence: (u.presence as Presence) ?? "offline",
      presenceUpdatedAt: u.presenceUpdatedAt ?? null,
      roles,
    });
  }
  return out;
}
