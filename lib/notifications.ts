import "server-only";
import { nanoid } from "nanoid";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { notifications, users } from "./db/schema";
import type { Notification } from "./db/schema";

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  actorName?: string | null;
}): Promise<void> {
  // org_id is derived from the recipient for tenant scoping.
  const u = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  await db.insert(notifications).values({
    id: nanoid(21),
    userId: input.userId,
    orgId: u[0]?.orgId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    actorName: input.actorName ?? null,
  });
}

export async function listNotifications(
  userId: string,
  limit = 50,
): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.c ?? 0);
}

/**
 * The link stored on the notification, or null if it isn't this user's.
 *
 * Read from the row rather than taken from the form, so what we redirect to is
 * something we wrote ourselves.
 */
export async function notificationLink(
  id: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ link: notifications.link })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .limit(1);
  return rows[0]?.link ?? null;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
