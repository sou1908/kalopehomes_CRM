"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  markNotificationRead,
  markAllNotificationsRead,
  notificationLink,
} from "@/lib/notifications";

const ROLES = ["telecaller", "site_agent", "admin"] as const;

/** Mark a notification read, then navigate to its linked item. */
export async function openNotificationAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/leads/inbox");

  // Read the destination from the row, not from the form. A posted link would
  // let anyone send a colleague off-site through a URL that looks like ours,
  // which is how a convincing phishing page gets clicked.
  const link = await notificationLink(id, user.id);
  await markNotificationRead(id, user.id);
  // Belt and braces: only ever a path on this site, never "//evil.com".
  const safe = link && link.startsWith("/") && !link.startsWith("//") ? link : null;
  redirect(safe ?? "/leads/inbox");
}

export async function markAllReadAction() {
  const user = await requireRole([...ROLES]);
  await markAllNotificationsRead(user.id);
  revalidatePath("/leads/inbox");
  revalidatePath("/leads");
}
