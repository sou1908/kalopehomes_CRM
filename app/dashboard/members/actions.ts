"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createMember, setMemberRoles, deleteMember, MemberError } from "@/lib/members";
import { ALL_ROLES } from "@/lib/roles";
import type { Role } from "@/lib/roles";

export type MemberFormState = { error?: string; ok?: boolean } | undefined;

function parseRoles(formData: FormData): Role[] {
  return ALL_ROLES.filter((r) => formData.get(`role_${r}`) != null);
}

export async function createMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const admin = await requireRole(["super_admin"]);
  if (!admin.orgId) return { error: "No organization found for your account." };
  try {
    await createMember({
      orgId: admin.orgId,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      roles: parseRoles(formData),
    });
  } catch (e) {
    if (e instanceof MemberError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function deleteMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const admin = await requireRole(["super_admin"]);
  if (!admin.orgId) return { error: "No organization found for your account." };
  const userId = String(formData.get("userId") ?? "");
  try {
    await deleteMember(admin.orgId, userId, admin.id);
  } catch (e) {
    if (e instanceof MemberError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function updateMemberRolesAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const admin = await requireRole(["super_admin"]);
  if (!admin.orgId) return { error: "No organization found for your account." };
  const userId = String(formData.get("userId") ?? "");
  try {
    await setMemberRoles(admin.orgId, userId, parseRoles(formData));
  } catch (e) {
    if (e instanceof MemberError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard/members");
  return { ok: true };
}
