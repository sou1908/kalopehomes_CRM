"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteActivityAction, editActivityAction } from "../actions";

const META: Record<string, { icon: string; verb: string }> = {
  note: { icon: "📝", verb: "added a note" },
  call: { icon: "📞", verb: "logged a call" },
  whatsapp: { icon: "💬", verb: "sent a WhatsApp" },
  email: { icon: "✉️", verb: "logged an email" },
  meeting: { icon: "🤝", verb: "logged a meeting" },
  stage_change: { icon: "↪", verb: "changed the stage" },
  created: { icon: "✨", verb: "created the lead" },
  converted: { icon: "✅", verb: "converted the lead" },
  assigned: { icon: "👤", verb: "updated assignment" },
  desk_change: { icon: "🪑", verb: "moved desk" },
  transferred: { icon: "➡️", verb: "transferred the lead" },
};

const OUTCOME_TONE: Record<string, string> = {
  Connected: "border-success/40 text-success",
  "Callback requested": "border-marigold/40 text-marigold",
  Declined: "border-danger/40 text-danger",
};

const EDITABLE = new Set(["note", "call", "whatsapp", "meeting"]);

export type ActivityItemData = {
  id: string;
  kind: string;
  actorName: string;
  body: string;
  outcome: string | null;
  visibility: string;
  dateLabel: string;
};

export function ActivityItem({
  a,
  leadId,
  canManage,
  variant,
}: {
  a: ActivityItemData;
  leadId: string;
  canManage: boolean;
  variant: "compact" | "timeline";
}) {
  const [editing, setEditing] = useState(false);
  const [state, editAction, pending] = useActionState(editActivityAction, undefined);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  const meta = META[a.kind] ?? { icon: "•", verb: a.kind };
  const canEdit = canManage && EDITABLE.has(a.kind);

  const head = (
    <div className="text-xs text-muted">
      <span className="font-medium text-text">{a.actorName}</span> {meta.verb}
      {a.outcome && (
        <span
          className={`ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] ${
            OUTCOME_TONE[a.outcome] ?? "border-border text-muted"
          }`}
        >
          {a.outcome}
        </span>
      )}
      {a.visibility === "private" && (
        <span className="ml-1.5 inline-flex items-center rounded-full border border-border px-1.5 py-0 text-[10px] text-muted">
          🔒 private
        </span>
      )}
      <span className="mx-1" aria-hidden>·</span>
      <span className="font-mono text-[10px]">{a.dateLabel}</span>
    </div>
  );

  const body = editing ? (
    <form action={editAction} className="mt-1.5 space-y-2">
      <input type="hidden" name="activityId" value={a.id} />
      <input type="hidden" name="leadId" value={leadId} />
      <textarea
        name="body"
        defaultValue={a.body}
        rows={2}
        autoFocus
        className="input text-sm"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-xs">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-muted hover:text-text"
        >
          Cancel
        </button>
        {state?.error && <span className="text-[11px] text-danger">{state.error}</span>}
      </div>
    </form>
  ) : (
    a.body && (
      <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {a.body}
      </div>
    )
  );

  const controls = canManage && !editing && (
    <div className="mt-1 flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] text-muted hover:text-accentInk"
        >
          Edit
        </button>
      )}
      <form
        action={deleteActivityAction}
        onSubmit={(e) => {
          if (!confirm("Delete this entry? This can't be undone.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="activityId" value={a.id} />
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className="text-[11px] text-muted hover:text-danger">
          Delete
        </button>
      </form>
    </div>
  );

  if (variant === "timeline") {
    return (
      <li className="group relative">
        <span
          className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-elevated text-[11px] ring-4 ring-panel"
          aria-hidden
        >
          {meta.icon}
        </span>
        {head}
        {body}
        {controls}
      </li>
    );
  }

  return (
    <li className="group flex gap-3 border-t border-border/60 pt-3 first:border-t-0 first:pt-0 [&:not(:last-child)]:pb-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-elevated text-xs"
        aria-hidden
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        {head}
        {body}
        {controls}
      </div>
    </li>
  );
}
