"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addTodoAction, updateTodoAction } from "../actions";

type Attachment = { url: string; name: string; kind?: "file" | "link" };

function linkHost(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

const PRIORITIES = [
  { value: "urgent", label: "Urgent", dot: "bg-danger" },
  { value: "high", label: "High", dot: "bg-marigold" },
  { value: "normal", label: "Normal", dot: "bg-muted" },
  { value: "low", label: "Low", dot: "bg-slate" },
];

export type Member = { id: string; name: string };

export type TodoInitial = {
  id: string;
  title: string;
  notes: string;
  priority: string;
  due: string; // datetime-local value or ""
  remind: string;
  attachments: Attachment[];
  assigneeUserId?: string;
};

export function TodoComposer({
  mode,
  initial,
  onClose,
  autoExpand,
  members = [],
  currentUserId,
}: {
  mode: "add" | "edit";
  initial?: TodoInitial;
  onClose?: () => void;
  autoExpand?: boolean;
  members?: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(mode === "edit" || !!autoExpand);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "normal");
  const [due, setDue] = useState(initial?.due ?? "");
  const [remind, setRemind] = useState(initial?.remind ?? "");
  const [assignee, setAssignee] = useState(initial?.assigneeUserId ?? currentUserId);
  const [attachments, setAttachments] = useState<Attachment[]>(initial?.attachments ?? []);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setNotes("");
    setPriority("normal");
    setDue("");
    setRemind("");
    setAssignee(currentUserId);
    setAttachments([]);
    setLinkUrl("");
    setLinkOpen(false);
  }

  function addLink() {
    let u = linkUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    setAttachments((a) => [...a, { url: u, name: u, kind: "link" }]);
    setLinkUrl("");
    setLinkOpen(false);
  }

  async function upload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url, name } = await res.json();
        if (url) setAttachments((a) => [...a, { url, name: name ?? file.name }]);
      }
    } catch {
      /* noop */
    }
    setUploading(false);
  }

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("notes", notes);
    fd.set("priority", priority);
    fd.set("dueDate", due);
    fd.set("remindAt", remind);
    fd.set("assigneeUserId", assignee);
    fd.set("attachments", JSON.stringify(attachments));
    if (mode === "edit" && initial) {
      fd.set("id", initial.id);
      await updateTodoAction(fd);
      setBusy(false);
      router.refresh();
      onClose?.();
    } else {
      await addTodoAction(fd);
      setBusy(false);
      reset();
      router.refresh();
      titleRef.current?.focus();
    }
  }

  // Collapsed quick-add bar (add mode only).
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => titleRef.current?.focus(), 0);
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-sm text-muted transition-colors hover:border-muted hover:text-text"
      >
        <span className="text-accentInk">＋</span> Add a to-do…
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-gradient-to-b from-panel to-sunken p-3 shadow-lg shadow-black/20 ring-1 ring-inset ring-white/[0.02] transition-colors focus-within:border-accent/50">
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="What needs doing?"
        className="w-full bg-transparent text-[15px] font-medium text-text outline-none placeholder:text-muted/70"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Description"
        rows={notes ? 2 : 1}
        className="mt-1 w-full resize-none bg-transparent text-[13px] text-text/90 outline-none placeholder:text-muted"
      />

      {/* attachment + link chips */}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span key={`${a.url}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-[11px]">
              <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[14rem] truncate text-text hover:text-accentInk">
                {a.kind === "link" ? "🔗" : "📎"} {a.kind === "link" ? linkHost(a.url) : a.name}
              </a>
              <button
                type="button"
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                className="text-muted hover:text-danger"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* option chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <AssigneeChip value={assignee} members={members} currentUserId={currentUserId} onChange={setAssignee} />
        <DateChip icon="📅" label="Due date" value={due} onChange={setDue} tone="accent" />
        <PriorityChip value={priority} onChange={setPriority} />
        <DateChip icon="⏰" label="Remind me" value={remind} onChange={setRemind} tone="marigold" />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-muted hover:text-text"
        >
          <span>📎</span>
          {uploading ? "Uploading…" : "Attach"}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => setLinkOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            linkOpen ? "border-accent/50 text-text" : "border-border text-muted hover:border-muted hover:text-text"
          }`}
        >
          <span>🔗</span>
          Link
        </button>
      </div>

      {/* link input */}
      {linkOpen && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder="Paste a URL…  (e.g. figma.com/file/…)"
            className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!linkUrl.trim()}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-text hover:bg-elevated disabled:opacity-40"
          >
            Add link
          </button>
        </div>
      )}

      {/* footer */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-2.5">
        <button
          type="button"
          onClick={() => {
            if (mode === "edit") onClose?.();
            else {
              reset();
              setExpanded(false);
            }
          }}
          className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || busy}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accentHover disabled:opacity-40"
        >
          {mode === "edit" ? "Save" : "Add to-do"}
        </button>
      </div>
    </div>
  );
}

/** Pretty "Jun 10, 2:30 PM" (time hidden when it's midnight). */
function fmtLocal(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(d);
}

/** A pill that opens the native date/time picker on click and shows a tidy value. */
function DateChip({
  icon,
  label,
  value,
  onChange,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  tone: "accent" | "marigold";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const has = !!value;
  const open = () => {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    try {
      el.showPicker ? el.showPicker() : el.focus();
    } catch {
      el.focus();
    }
  };
  const activeCls =
    tone === "accent"
      ? "border-accent/50 bg-accent/10 text-text"
      : "border-marigold/50 bg-marigold/10 text-text";
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        has ? activeCls : "border-border text-muted hover:border-muted hover:text-text"
      }`}
    >
      <button type="button" onClick={open} className="inline-flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{has ? fmtLocal(value) : label}</span>
      </button>
      {has && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-muted hover:text-danger"
          aria-label={`Clear ${label}`}
        >
          ✕
        </button>
      )}
      <input
        ref={ref}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-2 h-0 w-0 opacity-0 [color-scheme:dark]"
      />
    </span>
  );
}

/** Assign-to pill — pick yourself or another member; native select overlaid. */
function AssigneeChip({
  value,
  members,
  currentUserId,
  onChange,
}: {
  value: string;
  members: Member[];
  currentUserId: string;
  onChange: (v: string) => void;
}) {
  const isMe = value === currentUserId;
  const name = isMe ? "Me" : members.find((m) => m.id === value)?.name ?? "Me";
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        isMe ? "border-border text-muted hover:border-muted" : "border-accent/50 bg-accent/10 text-text"
      }`}
    >
      <span>👤</span>
      <span className="text-text">{name}</span>
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
        <path d="M4 6l4 4 4-4" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Assign to"
      >
        <option value={currentUserId}>Me</option>
        {members
          .filter((m) => m.id !== currentUserId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
    </span>
  );
}

/** A pill showing the current priority with its dot; native select overlaid for the menu. */
function PriorityChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const p = PRIORITIES.find((x) => x.value === value) ?? PRIORITIES[2];
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-muted">
      <span className={`h-2 w-2 rounded-full ${p.dot}`} />
      <span className="text-text">{p.label}</span>
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
        <path d="M4 6l4 4 4-4" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Priority"
      >
        {PRIORITIES.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  );
}
