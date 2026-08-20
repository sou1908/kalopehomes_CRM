"use client";

import { useState } from "react";
import { parseJourneyChecks } from "@/lib/leads-shared";

/**
 * A tick-list for a stage — what was done on site.
 *
 * Stored as the list of ticked labels rather than a true/false per item, so
 * adding or renaming an item later doesn't strand a pile of stale keys. The
 * cost is that renaming an item loses its ticks, which is the right trade for
 * a checklist that changes as the business learns what to check.
 *
 * Submits `name` as a JSON array of the ticked labels.
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
  const [checked, setChecked] = useState<string[]>(() =>
    parseJourneyChecks(defaultValue),
  );

  const toggle = (item: string) =>
    setChecked((c) => (c.includes(item) ? c.filter((x) => x !== item) : [...c, item]));

  if (items.length === 0) return null;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(checked)} />

      <ul className="grid gap-1 sm:grid-cols-2">
        {items.map((item) => {
          const on = checked.includes(item);
          return (
            <li key={item}>
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                  on ? "bg-success/10 text-text" : "text-muted hover:bg-elevated"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(item)}
                  className="accent-accent"
                />
                {item}
              </label>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        {checked.length} of {items.length} done
      </p>
    </div>
  );
}
