"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleTodoAction, deleteTodoAction } from "../actions";
import { TodoComposer, type Member } from "./todo-composer";

type Attachment = { url: string; name: string; kind?: "file" | "link" };

type Todo = {
  id: string;
  title: string;
  notes: string;
  done: boolean;
  priority: "low" | "normal" | "high" | "urgent";
  dueMs: number | null;
  dueInput: string;
  remindMs: number | null;
  remindInput: string;
  attachments: Attachment[];
  assigneeUserId: string;
  assigneeName: string | null;
  creatorUserId: string | null;
  creatorName: string | null;
};

const PRIO: Record<string, { dot: string; label: string }> = {
  urgent: { dot: "bg-danger", label: "Urgent" },
  high: { dot: "bg-marigold", label: "High" },
  normal: { dot: "bg-muted", label: "Normal" },
  low: { dot: "bg-slate", label: "Low" },
};

export function TodoItem({
  todo,
  members = [],
  currentUserId,
}: {
  todo: Todo;
  members?: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: (fd: FormData) => Promise<void>) {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("id", todo.id);
    await action(fd);
    setBusy(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="my-1">
        <TodoComposer
          mode="edit"
          members={members}
          currentUserId={currentUserId}
          initial={{
            id: todo.id,
            title: todo.title,
            notes: todo.notes,
            priority: todo.priority,
            due: todo.dueInput,
            remind: todo.remindInput,
            attachments: todo.attachments,
            assigneeUserId: todo.assigneeUserId,
          }}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  const due = dueMeta(todo.dueMs, todo.done);
  const remind = !todo.done && todo.remindMs ? fmtChip(todo.remindMs) : null;
  // Who's involved: "→ Name" when I assigned it out; "from Name" when it's mine.
  const assignedOut = todo.assigneeUserId !== currentUserId;
  const assignedToMeBy =
    !assignedOut && todo.creatorUserId && todo.creatorUserId !== currentUserId
      ? todo.creatorName
      : null;

  return (
    <div className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel/60">
      {/* checkbox */}
      <button
        type="button"
        onClick={() => run(toggleTodoAction)}
        aria-label={todo.done ? "Mark not done" : "Mark done"}
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
          todo.done ? "border-success bg-success text-bg" : "border-muted hover:border-accent"
        }`}
      >
        {todo.done && (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-6.5" />
          </svg>
        )}
      </button>

      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIO[todo.priority]?.dot ?? "bg-muted"}`} title={PRIO[todo.priority]?.label} />

      {/* body — click to edit */}
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-sm ${todo.done ? "text-muted line-through" : "text-text"}`}>
          {todo.title}
        </div>
        {todo.notes.trim() && (
          <div className="mt-0.5 line-clamp-1 text-xs text-muted">{todo.notes}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {assignedOut && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accentInk">
              → {todo.assigneeName ?? "member"}
            </span>
          )}
          {assignedToMeBy && (
            <span className="rounded bg-panel px-1.5 py-0.5 text-muted">from {assignedToMeBy}</span>
          )}
          {due && <span className={`rounded px-1.5 py-0.5 ${due.cls}`}>{due.label}</span>}
          {remind && <span className="rounded bg-panel px-1.5 py-0.5 text-muted">⏰ {remind}</span>}
          {todo.attachments.filter((a) => a.kind !== "link").length > 0 && (
            <span className="text-muted">📎 {todo.attachments.filter((a) => a.kind !== "link").length}</span>
          )}
          {todo.attachments.filter((a) => a.kind === "link").length > 0 && (
            <span className="text-muted">🔗 {todo.attachments.filter((a) => a.kind === "link").length}</span>
          )}
        </div>
      </button>

      {/* hover controls */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={() => setEditing(true)} title="Edit" className="rounded p-1 text-muted hover:text-text">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" />
          </svg>
        </button>
        <button type="button" onClick={() => run(deleteTodoAction)} title="Delete" className="rounded p-1 text-muted hover:text-danger">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function fmtChip(ms: number): string {
  const d = new Date(ms);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

function dueMeta(dueMs: number | null, done: boolean): { label: string; cls: string } | null {
  if (dueMs == null || done) return null;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((dueMs - startToday) / 86400000);
  const d = new Date(dueMs);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const time = hasTime
    ? " " + new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(d)
    : "";
  if (dayDiff < 0) return { label: `Overdue${time}`, cls: "bg-danger/15 text-danger" };
  if (dayDiff === 0) return { label: `Today${time}`, cls: "bg-accent/15 text-accentInk" };
  if (dayDiff === 1) return { label: `Tomorrow${time}`, cls: "bg-panel text-muted" };
  return { label: fmtChip(dueMs), cls: "bg-panel text-muted" };
}
