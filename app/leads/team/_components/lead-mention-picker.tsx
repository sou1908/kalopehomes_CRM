"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeadMention } from "@/lib/leads-shared";

/**
 * A small searchable popover for tagging a lead into a chat message. Shows
 * ongoing (open-stage) leads first; typing searches across all leads.
 */
export function LeadMentionPicker({
  leads,
  excludeIds,
  onPick,
}: {
  leads: LeadMention[];
  excludeIds: string[];
  onPick: (lead: LeadMention) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = leads.filter((l) => !excluded.has(l.id));
    const matched = needle
      ? base.filter(
          (l) =>
            l.name.toLowerCase().includes(needle) ||
            (l.company ?? "").toLowerCase().includes(needle),
        )
      : base.filter((l) => l.open);
    // Open leads first, then by name.
    return matched
      .slice()
      .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [leads, q, excluded]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-accent/50 hover:text-text"
        title="Tag a lead"
      >
        ＃ Tag lead
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-border bg-sunken p-2 shadow-xl">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads…"
            className="input mb-2 w-full text-sm"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {results.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted">
                {q ? "No matching leads." : "No ongoing leads."}
              </div>
            )}
            {results.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onPick(l);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel"
              >
                <span className="text-accentInk">＃</span>
                <span className="min-w-0 flex-1 truncate">
                  {l.name}
                  {l.company && <span className="text-muted"> · {l.company}</span>}
                </span>
                {!l.open && (
                  <span className="rounded-full bg-panel px-1.5 text-[10px] text-muted">
                    closed
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
