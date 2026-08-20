"use client";

import { useState } from "react";
import { parseJourneyChecks, type JourneyCheck } from "@/lib/leads-shared";
import { Icon } from "@/app/_components/icons";

/**
 * A tick-list for a stage — what was done on site, and anything worth saying
 * about it.
 *
 * A remark is allowed on any item, ticked or not. "Not done, meter box was
 * locked" tells the office more than an empty box does, and it's the reason
 * they'd otherwise have to ring the agent to find out.
 *
 * Stored keyed by the item's own label rather than an index or generated id, so
 * reordering the list doesn't scramble what was recorded. Renaming an item does
 * lose its entry — the right trade for a checklist that changes as the business
 * learns what to check.
 *
 * Submits `name` as JSON: [{ item, checked, note? }], skipping items that are
 * neither ticked nor annotated.
 */
export function ChecklistField({
  name,
  items,
  defaultValue,
}: {
  name: string;
  items: string[];
  defaultValue: string;
}) {
  const [state, setState] = useState<JourneyCheck[]>(() =>
    parseJourneyChecks(defaultValue),
  );
  // Which rows are showing their remark box — a remark already written keeps
  // its box open on its own.
  const [open, setOpen] = useState<string[]>([]);

  const entry = (item: string) => state.find((s) => s.item === item);

  const set = (item: string, patch: Partial<JourneyCheck>) =>
    setState((s) => {
      const found = s.find((x) => x.item === item);
      const next: JourneyCheck = {
        item,
        checked: found?.checked ?? false,
        note: found?.note,
        ...patch,
      };
      const rest = s.filter((x) => x.item !== item);
      return [...rest, next];
    });

  if (items.length === 0) return null;

  // Only rows that say something are worth storing.
  const stored = state.filter(
    (s) => s.checked || (s.note != null && s.note.trim() !== ""),
  );
  const doneCount = stored.filter((s) => s.checked).length;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(stored)} />

      <ul className="grid gap-1 sm:grid-cols-2">
        {items.map((item) => {
          const e = entry(item);
          const on = e?.checked ?? false;
          const note = e?.note ?? "";
          const showNote = note !== "" || open.includes(item);

          return (
            <li
              key={item}
              className={`rounded-md px-2 py-1.5 transition-colors ${
                on ? "bg-success/10" : "hover:bg-elevated"
              }`}
            >
              <div className="flex items-center gap-2">
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 text-[13px] ${
                    on ? "text-text" : "text-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set(item, { checked: !on })}
                    className="accent-accent"
                  />
                  {item}
                </label>

                {!showNote && (
                  <button
                    type="button"
                    onClick={() => setOpen((o) => [...o, item])}
                    title={`Add a remark about "${item}"`}
                    aria-label={`Add a remark about ${item}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted/60 transition-colors hover:bg-elevated hover:text-text"
                  >
                    <Icon name="plus" size={12} />
                  </button>
                )}
              </div>

              {showNote && (
                <input
                  value={note}
                  onChange={(e2) => set(item, { note: e2.target.value })}
                  placeholder="Remark (optional)"
                  aria-label={`Remark about ${item}`}
                  autoFocus={note === ""}
                  className="input mt-1.5 px-2 py-1 text-[12px]"
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        {doneCount} of {items.length} done
      </p>
    </div>
  );
}
