"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  setLeadTagsAction,
  createLeadTagAction,
  updateLeadTagAction,
  deleteLeadTagAction,
} from "../actions";
import { STAGE_COLOR_PALETTE, type LeadTagInfo } from "@/lib/leads-shared";

/** Multi-select tag editor for a lead: toggle, create, and manage (edit/delete). */
export function LeadTagEditor({
  leadId,
  allTags,
  selectedIds,
}: {
  leadId: string;
  allTags: LeadTagInfo[];
  selectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTag = allTags.find((t) => t.id === editingId) ?? null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <form action={setLeadTagsAction} className="space-y-3">
        <input type="hidden" name="leadId" value={leadId} />
        {/* Selected ids submitted as hidden inputs so the toggle state is the source of truth. */}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="tagIds" value={id} />
        ))}
        <div className="flex flex-wrap gap-2">
          {allTags.length === 0 && (
            <span className="text-xs text-muted">No tags yet — add one below.</span>
          )}
          {allTags.map((t) => {
            const on = selected.has(t.id);
            return (
              <span
                key={t.id}
                className={`group inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1.5 text-xs transition ${
                  on ? "border-transparent text-black" : "border-border text-muted"
                }`}
                style={on ? { background: t.color } : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="inline-flex items-center gap-1.5 hover:opacity-90"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: on ? "rgba(0,0,0,0.5)" : t.color }}
                  />
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId((id) => (id === t.id ? null : t.id))}
                  aria-label={`Edit ${t.name}`}
                  title="Edit tag"
                  className={`rounded-full px-1 text-[10px] leading-none ${
                    on ? "text-black/60 hover:text-black" : "text-muted/60 hover:text-text"
                  }`}
                >
                  ✎
                </button>
              </span>
            );
          })}
        </div>
        <button type="submit" className="btn-primary text-xs">
          Save tags
        </button>
      </form>

      {/* Inline editor for the single tag whose ✎ was clicked */}
      {editingTag && (
        <ManageTagRow
          key={editingTag.id}
          tag={editingTag}
          leadId={leadId}
          onDone={() => setEditingId(null)}
        />
      )}

      {adding && <InlineCreateTag onDone={() => setAdding(false)} />}

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-accentInk hover:underline"
        >
          ＋ New tag
        </button>
      )}
    </div>
  );
}

/** Inline editor for one tag: recolor + rename (save), delete, or cancel. */
function ManageTagRow({
  tag,
  leadId,
  onDone,
}: {
  tag: LeadTagInfo;
  leadId: string;
  onDone: () => void;
}) {
  const [color, setColor] = useState(tag.color);
  const router = useRouter();

  return (
    <div className="rounded-md border border-accent/40 bg-bg p-2">
      <form
        action={async (fd) => {
          await updateLeadTagAction(fd);
          router.refresh();
          onDone();
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="tagId" value={tag.id} />
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="color" value={color} />
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <input name="name" defaultValue={tag.name} required autoFocus className="input flex-1 text-xs" />
        <button type="submit" className="text-[11px] text-accentInk hover:underline">
          Save
        </button>
      </form>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STAGE_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`h-4 w-4 rounded-full border-2 ${color === c ? "border-text" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="text-[11px] text-muted hover:text-text"
          >
            Cancel
          </button>
          <form
            action={async (fd) => {
              await deleteLeadTagAction(fd);
              router.refresh();
              onDone();
            }}
          >
            <input type="hidden" name="tagId" value={tag.id} />
            <input type="hidden" name="leadId" value={leadId} />
            <button type="submit" className="text-[11px] text-danger hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function InlineCreateTag({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createLeadTagAction, undefined);
  const [color, setColor] = useState(STAGE_COLOR_PALETTE[0]);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.id && state !== lastHandled.current) {
      lastHandled.current = state;
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <input
          name="name"
          required
          autoFocus
          placeholder="Tag name"
          className="input text-xs"
        />
        <input type="hidden" name="color" value={color} />
        <button type="submit" disabled={pending} className="btn-primary text-xs">
          {pending ? "…" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-muted hover:text-text">
          Cancel
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGE_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-text" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      {state?.error && <div className="mt-2 text-[11px] text-danger">{state.error}</div>}
    </form>
  );
}
