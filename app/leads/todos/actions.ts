"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createTodo,
  toggleTodo,
  updateTodo,
  deleteTodo,
  clearCompletedTodos,
  listAssignableMembers,
  getTodoAssignee,
  type AssignableRole,
  type Priority,
  type TodoAttachment,
} from "@/lib/todos";
import { createNotification } from "@/lib/notifications";
import type { AuthedUser } from "@/lib/auth";

const TODO_INBOX_LINK = "/leads/todos?filter=tome";

// Shared to-dos: on the leads surface they're managed by the lead manager /
// admin. Assignment is scoped to lead managers + super admins.
const ROLES = ["telecaller", "site_agent", "admin"] as const;
const ASSIGN_SCOPE: AssignableRole[] = ["telecaller", "site_agent", "admin"];
const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

/** Validate a chosen assignee is in scope for this surface (self always allowed). */
async function pickAssignee(
  raw: FormDataEntryValue | null,
  user: AuthedUser,
): Promise<string | undefined> {
  const id = String(raw ?? "").trim();
  if (!id) return undefined;
  if (id === user.id) return user.id;
  if (!user.orgId) return undefined;
  const members = await listAssignableMembers(user.orgId, ASSIGN_SCOPE);
  return members.some((m) => m.id === id) ? id : undefined;
}

/** Parse a date or datetime-local input ("2026-06-10" or "2026-06-10T12:30"). */
function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  return isNaN(d.getTime()) ? null : d;
}

function parseAttachments(raw: string): TodoAttachment[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.url === "string")
      .map((a) => ({
        url: String(a.url),
        name: String(a.name ?? "file"),
        kind: a.kind === "link" ? ("link" as const) : ("file" as const),
      }));
  } catch {
    return [];
  }
}

export async function addTodoAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const title = String(formData.get("title") ?? "");
  if (!title.trim()) return;
  const priorityRaw = String(formData.get("priority") ?? "normal") as Priority;
  const assignee = await pickAssignee(formData.get("assigneeUserId"), user);
  await createTodo(
    user.id,
    user.orgId ?? null,
    {
      title,
      notes: String(formData.get("notes") ?? ""),
      priority: PRIORITIES.includes(priorityRaw) ? priorityRaw : "normal",
      dueDate: parseDate(String(formData.get("dueDate") ?? "")),
      remindAt: parseDate(String(formData.get("remindAt") ?? "")),
      attachments: parseAttachments(String(formData.get("attachments") ?? "")),
    },
    assignee ?? null,
  );
  // Notify the assignee when it's someone other than the creator.
  if (assignee && assignee !== user.id) {
    await createNotification({
      userId: assignee,
      type: "todo_assigned",
      title: `To-do assigned to you: ${title.trim()}`,
      link: TODO_INBOX_LINK,
      actorName: user.name,
    });
  }
  revalidatePath("/leads/todos");
  revalidatePath("/leads");
}

export async function toggleTodoAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  await toggleTodo(String(formData.get("id") ?? ""), user.id);
  revalidatePath("/leads/todos");
  revalidatePath("/leads");
}

export async function updateTodoAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  const id = String(formData.get("id") ?? "");
  const patch: {
    title?: string;
    notes?: string;
    priority?: Priority;
    dueDate?: Date | null;
    remindAt?: Date | null;
    attachments?: TodoAttachment[];
    assigneeUserId?: string;
  } = {};
  if (formData.has("title")) patch.title = String(formData.get("title") ?? "");
  if (formData.has("notes")) patch.notes = String(formData.get("notes") ?? "");
  if (formData.has("priority")) {
    const p = String(formData.get("priority") ?? "") as Priority;
    if (PRIORITIES.includes(p)) patch.priority = p;
  }
  if (formData.has("dueDate")) patch.dueDate = parseDate(String(formData.get("dueDate") ?? ""));
  if (formData.has("remindAt")) patch.remindAt = parseDate(String(formData.get("remindAt") ?? ""));
  if (formData.has("attachments"))
    patch.attachments = parseAttachments(String(formData.get("attachments") ?? ""));
  if (formData.has("assigneeUserId")) {
    const a = await pickAssignee(formData.get("assigneeUserId"), user);
    if (a) patch.assigneeUserId = a;
  }
  const prevAssignee = patch.assigneeUserId ? await getTodoAssignee(id) : null;
  await updateTodo(id, user.id, patch);
  if (
    patch.assigneeUserId &&
    patch.assigneeUserId !== user.id &&
    patch.assigneeUserId !== prevAssignee
  ) {
    await createNotification({
      userId: patch.assigneeUserId,
      type: "todo_assigned",
      title: `To-do assigned to you${patch.title ? `: ${patch.title.trim()}` : ""}`,
      link: TODO_INBOX_LINK,
      actorName: user.name,
    });
  }
  revalidatePath("/leads/todos");
  revalidatePath("/leads");
}

export async function deleteTodoAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  await deleteTodo(String(formData.get("id") ?? ""), user.id);
  revalidatePath("/leads/todos");
  revalidatePath("/leads");
}

export async function clearCompletedTodosAction() {
  const user = await requireRole([...ROLES]);
  await clearCompletedTodos(user.id);
  revalidatePath("/leads/todos");
  revalidatePath("/leads");
}
