import "server-only";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { todos, users, userRoles } from "@/lib/db/schema";

export type Priority = "low" | "normal" | "high" | "urgent";

export type TodoAttachment = { url: string; name: string; kind?: "file" | "link" };

export type Todo = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  priority: Priority;
  dueDate: Date | null;
  remindAt: Date | null;
  attachments: TodoAttachment[];
  createdAt: Date;
  completedAt: Date | null;
  // Assignment: who it's for + who assigned it.
  assigneeUserId: string;
  assigneeName: string | null;
  creatorUserId: string | null;
  creatorName: string | null;
};

export type Member = { id: string; name: string };

export type AssignableRole =
  | "admin"
  | "telecaller"
  | "site_agent"
  | "operation_manager";

/** Users in an org that the current surface may assign to-dos to, by role. */
export async function listAssignableMembers(
  orgId: string,
  allowedRoles: AssignableRole[],
): Promise<Member[]> {
  if (allowedRoles.length === 0) return [];
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.orgId, orgId), inArray(userRoles.role, allowedRoles)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Look up display names for a set of user ids. */
async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, uniq));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

function parseAttachments(raw: string): TodoAttachment[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && typeof a.url === "string").map((a) => ({
      url: String(a.url),
      name: String(a.name ?? "file"),
      kind: a.kind === "link" ? ("link" as const) : ("file" as const),
    }));
  } catch {
    return [];
  }
}

type TodoRow = typeof todos.$inferSelect;

function toTodo(r: TodoRow, names: Map<string, string>): Todo {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    done: r.done,
    priority: r.priority as Priority,
    dueDate: r.dueDate,
    remindAt: r.remindAt,
    attachments: parseAttachments(r.attachments),
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    assigneeUserId: r.userId,
    assigneeName: names.get(r.userId) ?? null,
    creatorUserId: r.creatorUserId ?? null,
    creatorName: r.creatorUserId ? names.get(r.creatorUserId) ?? null : null,
  };
}

function sortTodos(a: Todo, b: Todo): number {
  if (a.done !== b.done) return a.done ? 1 : -1; // active before done
  if (!a.done) {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  }
  return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
}

/** A user's to-dos (assigned to them), active first, done last. */
export async function listTodos(userId: string): Promise<Todo[]> {
  const rows = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(asc(todos.done), desc(todos.createdAt));
  const names = await namesFor(rows.flatMap((r) => [r.userId, r.creatorUserId ?? ""]));
  return rows.map((r) => toTodo(r, names)).sort(sortTodos);
}

/** To-dos this user assigned to someone else (to track what they delegated). */
export async function listAssignedByMe(userId: string): Promise<Todo[]> {
  const rows = await db
    .select()
    .from(todos)
    .where(and(eq(todos.creatorUserId, userId), ne(todos.userId, userId)))
    .orderBy(asc(todos.done), desc(todos.createdAt));
  const names = await namesFor(rows.flatMap((r) => [r.userId, r.creatorUserId ?? ""]));
  return rows.map((r) => toTodo(r, names)).sort(sortTodos);
}

/** Active to-dos that have a reminder set — fed to the client reminder watcher. */
export async function listActiveReminders(
  userId: string,
): Promise<{ id: string; title: string; remindAt: Date }[]> {
  const rows = await db
    .select({ id: todos.id, title: todos.title, remindAt: todos.remindAt })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.done, false)));
  return rows
    .filter((r): r is { id: string; title: string; remindAt: Date } => r.remindAt != null)
    .map((r) => ({ id: r.id, title: r.title, remindAt: r.remindAt }));
}

/**
 * Overdue, not-done to-dos to surface as a "while you were away" catch-up when
 * the user returns — a reminder time that has passed, or a due date that has.
 */
export async function listTodoCatchup(
  userId: string,
): Promise<{ id: string; title: string; kind: "reminder" | "due"; whenMs: number }[]> {
  const rows = await db
    .select({
      id: todos.id,
      title: todos.title,
      dueDate: todos.dueDate,
      remindAt: todos.remindAt,
    })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.done, false)));
  const now = Date.now();
  const out: { id: string; title: string; kind: "reminder" | "due"; whenMs: number }[] = [];
  for (const r of rows) {
    if (r.remindAt && r.remindAt.getTime() <= now) {
      out.push({ id: r.id, title: r.title, kind: "reminder", whenMs: r.remindAt.getTime() });
    } else if (r.dueDate && r.dueDate.getTime() <= now) {
      out.push({ id: r.id, title: r.title, kind: "due", whenMs: r.dueDate.getTime() });
    }
  }
  out.sort((a, b) => a.whenMs - b.whenMs); // most overdue first
  return out;
}

export async function countActiveTodos(userId: string): Promise<number> {
  const rows = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.done, false)));
  return rows.length;
}

export async function createTodo(
  creatorUserId: string,
  orgId: string | null,
  data: {
    title: string;
    notes?: string;
    priority?: Priority;
    dueDate?: Date | null;
    remindAt?: Date | null;
    attachments?: TodoAttachment[];
  },
  assigneeUserId?: string | null,
): Promise<void> {
  const title = data.title.trim();
  if (!title) return;
  await db.insert(todos).values({
    id: nanoid(),
    // userId is the ASSIGNEE (defaults to the creator = a personal to-do).
    userId: assigneeUserId || creatorUserId,
    creatorUserId,
    orgId: orgId ?? null,
    title,
    notes: data.notes?.trim() ?? "",
    priority: data.priority ?? "normal",
    dueDate: data.dueDate ?? null,
    remindAt: data.remindAt ?? null,
    attachments: JSON.stringify(data.attachments ?? []),
    done: false,
  });
}

/** Toggle done (and stamp completedAt). Scoped to the owner. */
export async function toggleTodo(id: string, userId: string): Promise<void> {
  const row = await getOwned(id, userId);
  if (!row) return;
  const done = !row.done;
  await db
    .update(todos)
    .set({ done, completedAt: done ? new Date() : null })
    .where(eq(todos.id, id));
}

export async function updateTodo(
  id: string,
  userId: string,
  patch: {
    title?: string;
    notes?: string;
    priority?: Priority;
    dueDate?: Date | null;
    remindAt?: Date | null;
    attachments?: TodoAttachment[];
    assigneeUserId?: string;
  },
): Promise<void> {
  const row = await getOwned(id, userId);
  if (!row) return;
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return;
    set.title = t;
  }
  if (patch.notes !== undefined) set.notes = patch.notes.trim();
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.remindAt !== undefined) set.remindAt = patch.remindAt;
  if (patch.attachments !== undefined) set.attachments = JSON.stringify(patch.attachments);
  // Reassignment moves the to-do to another person's list.
  if (patch.assigneeUserId) set.userId = patch.assigneeUserId;
  if (Object.keys(set).length === 0) return;
  await db.update(todos).set(set).where(eq(todos.id, id));
}

/** Current assignee of a to-do (for change detection before notifying). */
export async function getTodoAssignee(id: string): Promise<string | null> {
  const rows = await db
    .select({ a: todos.userId })
    .from(todos)
    .where(eq(todos.id, id))
    .limit(1);
  return rows[0]?.a ?? null;
}

export async function deleteTodo(id: string, userId: string): Promise<void> {
  // Either the assignee or the person who assigned it can delete.
  await db
    .delete(todos)
    .where(and(eq(todos.id, id), or(eq(todos.userId, userId), eq(todos.creatorUserId, userId))));
}

/** Remove all completed to-dos on a user's own list (the "Clear completed" button). */
export async function clearCompletedTodos(userId: string): Promise<void> {
  await db.delete(todos).where(and(eq(todos.userId, userId), eq(todos.done, true)));
}

/** A to-do the user may act on — they're either the assignee or the assigner. */
async function getOwned(id: string, userId: string) {
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(eq(todos.id, id), or(eq(todos.userId, userId), eq(todos.creatorUserId, userId))),
    )
    .limit(1);
  return rows[0] ?? null;
}
