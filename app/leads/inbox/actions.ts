"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications";

const ROLES = ["telecaller", "field_agent", "super_admin"] as const;

/** Mark a notification read, then navigate to its linked item. */
export async function openNotificationAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const link = String(formData.get("link") ?? "");
  if (id) await markNotificationRead(id, user.id);
  redirect(link || "/leads/inbox");
}

export async function markAllReadAction() {
  const user = await requireRole([...ROLES]);
  await markAllNotificationsRead(user.id);
  revalidatePath("/leads/inbox");
  revalidatePath("/leads");
}
