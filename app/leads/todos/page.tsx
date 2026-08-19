import Link from "next/link";
import { requireRole } from "@/lib/auth";
import {
  listTodos,
  listAssignedByMe,
  listAssignableMembers,
  type AssignableRole,
} from "@/lib/todos";
import { TodoComposer } from "./_components/todo-composer";
import { TodoItem } from "./_components/todo-item";
import { clearCompletedTodosAction } from "./actions";

// Lead managers assign within lead managers + super admins.
const ASSIGN_SCOPE: AssignableRole[] = ["telecaller", "field_agent", "super_admin"];

// datetime-local value for editing (YYYY-MM-DDTHH:mm) in local time.
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Filter = "all" | "today" | "upcoming" | "personal" | "tome" | "assigned" | "done";

export default async function LeadsTodosPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  const { filter: filterRaw } = await searchParams;
  const filter: Filter = (
    ["all", "today", "upcoming", "personal", "tome", "assigned", "done"] as const
  ).includes(filterRaw as Filter)
    ? (filterRaw as Filter)
    : "all";

  const [all, assignedByMe, members] = await Promise.all([
    listTodos(user.id),
    listAssignedByMe(user.id),
    user.orgId ? listAssignableMembers(user.orgId, ASSIGN_SCOPE) : Promise.resolve([]),
  ]);
  const now = new Date();
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const active = all.filter((t) => !t.done);
  const completed = all.filter((t) => t.done);
  // Today = your actionable-now list: no due date, due today, or overdue.
  const today = active.filter((t) => !t.dueDate || t.dueDate.getTime() <= endToday);
  const upcoming = active.filter((t) => t.dueDate && t.dueDate.getTime() > endToday);
  // Source split (like the issue board): self-made vs assigned to me by others.
  const personal = active.filter((t) => !t.creatorUserId || t.creatorUserId === user.id);
  const tome = active.filter((t) => t.creatorUserId && t.creatorUserId !== user.id);

  const shownSrc =
    filter === "today"
      ? today
      : filter === "upcoming"
        ? upcoming
        : filter === "personal"
          ? personal
          : filter === "tome"
            ? tome
            : filter === "done"
              ? completed
              : filter === "assigned"
                ? assignedByMe
                : active;

  const shown = shownSrc.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    done: t.done,
    priority: t.priority,
    dueMs: t.dueDate ? t.dueDate.getTime() : null,
    dueInput: toLocalInput(t.dueDate),
    remindMs: t.remindAt ? t.remindAt.getTime() : null,
    remindInput: toLocalInput(t.remindAt),
    attachments: t.attachments,
    assigneeUserId: t.assigneeUserId,
    assigneeName: t.assigneeName,
    creatorUserId: t.creatorUserId,
    creatorName: t.creatorName,
  }));

  // The view is chosen in the sidebar ("My to-dos" → Personal / Assigned to me /
  // Assigned). The page just shows that one list cleanly.
  const viewLabel =
    filter === "personal"
      ? "Personal"
      : filter === "tome"
        ? "Assigned to me"
        : filter === "assigned"
          ? "Assigned by you"
          : filter === "today"
            ? "Today"
            : filter === "upcoming"
              ? "Upcoming"
              : filter === "done"
                ? "Completed"
                : "All to-dos";

  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* header */}
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-muted">{dateLabel}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">My to-dos</h1>
        <p className="mt-1 text-sm text-muted">
          {active.length === 0
            ? "All clear — nothing on your list. ✦"
            : `${active.length} thing${active.length === 1 ? "" : "s"} to do${
                today.length ? ` · ${today.length} for today` : ""
              }.`}
        </p>
      </div>

      {/* add — hidden on "Assigned to me" + "Completed" (you act on those, not create them) */}
      {filter !== "tome" && filter !== "done" && (
        <TodoComposer mode="add" members={members} currentUserId={user.id} />
      )}

      {/* view label + quick filters */}
      <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {viewLabel} <span className="text-muted">· {shown.length}</span>
          {filter === "done" && completed.length > 0 && (
            <form action={clearCompletedTodosAction}>
              <button
                type="submit"
                className="text-[11px] font-normal text-muted transition-colors hover:text-danger"
              >
                Clear completed
              </button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[
            { key: "all", label: "All", count: active.length, href: "/leads/todos" },
            { key: "today", label: "Today", count: today.length, href: "/leads/todos?filter=today" },
            { key: "upcoming", label: "Upcoming", count: upcoming.length, href: "/leads/todos?filter=upcoming" },
            { key: "done", label: "Completed", count: completed.length, href: "/leads/todos?filter=done" },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${
                filter === t.key ? "bg-panel font-medium text-text" : "text-muted hover:text-text"
              }`}
            >
              {t.label}
              <span
                className={`min-w-[1.1rem] rounded px-1 text-center text-[11px] tabular-nums ${
                  filter === t.key ? "bg-bg text-text" : "text-muted"
                }`}
              >
                {t.count}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* list */}
      <div className="mt-2">
        {shown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
            {emptyMessage(filter)}
          </div>
        ) : (
          <div className="flex flex-col">
            {shown.map((t) => (
              <TodoItem key={t.id} todo={t} members={members} currentUserId={user.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyMessage(filter: Filter): string {
  switch (filter) {
    case "today":
      return "Nothing for today. Enjoy the breathing room.";
    case "upcoming":
      return "No upcoming to-dos with a due date.";
    case "done":
      return "No completed to-dos yet.";
    case "personal":
      return "No personal to-dos. Anything you add for yourself shows here.";
    case "tome":
      return "Nothing assigned to you right now.";
    case "assigned":
      return "You haven't assigned any to-dos to others yet. Pick a person in the composer above.";
    default:
      return "Your list is empty. Add your first to-do above.";
  }
}
