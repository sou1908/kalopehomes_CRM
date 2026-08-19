import "server-only";
import { nanoid } from "nanoid";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "./db";
import { users, userRoles } from "./db/schema";
import type { Role } from "./db/schema";
import { hashPassword } from "./auth";
import { STAFF_ROLES } from "./roles-shared";

export type MemberSummary = {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  createdAt: Date;
};

/**
 * All loginable user accounts in an org (members + admins), with their roles.
 * Excludes nothing — the super_admin sees themselves too.
 */
export async function listMembers(orgId: string): Promise<MemberSummary[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(desc(users.createdAt));

  const out: MemberSummary[] = [];
  for (const u of rows) {
    const roleRows = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, u.id));
    out.push({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: roleRows.map((r) => r.role as Role),
      createdAt: u.createdAt,
    });
  }
  return out;
}

/**
 * Staff accounts a lead can be assigned to (id + name only), excluding
 * client-only accounts. Cheaper than listMembers — one query, no per-user roles.
 */
export async function listAssignableMembers(
  orgId: string,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.orgId, orgId), ne(userRoles.role, "client")))
    .orderBy(users.name);
  return rows;
}

export class MemberError extends Error {}

/**
 * Create a loginable member account in `orgId` with the given roles.
 * Throws MemberError on a duplicate email or empty role set.
 */
export async function createMember(input: {
  orgId: string;
  name: string;
  email: string;
  password: string;
  roles: Role[];
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new MemberError("Name is required.");
  if (!email) throw new MemberError("Email is required.");
  if (input.password.length < 8)
    throw new MemberError("Password must be at least 8 characters.");
  if (input.roles.length === 0)
    throw new MemberError("Select at least one role.");

  const dup = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (dup.length > 0)
    throw new MemberError("A user with that email already exists.");

  const id = nanoid(21);
  const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({ id, orgId: input.orgId, email, passwordHash, name });
  for (const role of dedupe(input.roles)) {
    await db.insert(userRoles).values({ id: nanoid(21), userId: id, role });
  }
  return id;
}

/** Replace a member's role set. Won't strip the last super_admin in the org. */
export async function setMemberRoles(
  orgId: string,
  userId: string,
  roles: Role[],
): Promise<void> {
  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (target.length === 0) throw new MemberError("Member not found.");

  const next = dedupe(roles);
  // Guard: never leave the org with zero super_admins.
  if (!next.includes("super_admin")) {
    const others = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(users.orgId, orgId),
          eq(userRoles.role, "super_admin"),
          ne(userRoles.userId, userId),
        ),
      )
      .limit(1);
    if (others.length === 0)
      throw new MemberError("Can't remove the last Lead Manager.");
  }

  // Replace only the staff roles — never touch a 'client' role here (clients are
  // managed via projects, not this staff-role editor).
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), inArray(userRoles.role, STAFF_ROLES)));
  for (const role of next) {
    await db.insert(userRoles).values({ id: nanoid(21), userId, role });
  }
}

/**
 * Permanently delete a member account (cascades their roles + sessions).
 * Guards: can't delete yourself, can't delete the last super_admin (Lead Manager).
 */
export async function deleteMember(
  orgId: string,
  userId: string,
  requestingUserId: string,
): Promise<void> {
  if (userId === requestingUserId)
    throw new MemberError("You can't delete your own account.");

  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (target.length === 0) throw new MemberError("Member not found.");

  // Never delete the last super_admin in the org.
  const isSuperAdmin = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "super_admin")))
    .limit(1);
  if (isSuperAdmin.length > 0) {
    const otherAdmins = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(users.orgId, orgId),
          eq(userRoles.role, "super_admin"),
          ne(userRoles.userId, userId),
        ),
      )
      .limit(1);
    if (otherAdmins.length === 0)
      throw new MemberError("Can't delete the last Lead Manager.");
  }

  await db.delete(users).where(eq(users.id, userId));
}

function dedupe(roles: Role[]): Role[] {
  return Array.from(new Set(roles));
}
