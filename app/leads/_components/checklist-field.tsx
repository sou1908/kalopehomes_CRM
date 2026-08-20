"use client";

import { useState } from "react";
import {
  parseJourneyChecks,
  CHECK_STATUSES,
  type CheckStatus,
  type JourneyCheck,
} from "@/lib/leads-shared";
import { Icon } from "@/app/_components/icons";

/**
 * A three-answer checklist for a stage: yes, no, or pending.
 *
 * A checkbox couldn't tell "we couldn't do it" from "still to do", and those
 * need different things from the office — the first is a problem to solve, the
 * second is a reminder. Everything starts pending, because at the top of a
 * visit it genuinely is.
 *
 * A remark is allowed on any answer. "No — meter box was locked" is what saves
 * the office ringing the agent to ask why.
 *
 * Stored keyed by the item's own label, so reordering the list can't scramble
 * what was recorded. Only items actually answered or annotated are stored —
 * absence reads as pending.
 *
 * Submits `name` as JSON: [{ item, status, note? }].
 */
const LABELS: Record<CheckStatus, string> = {
  yes: "Yes",
  no: "No",
  pending: "Pending",
};

/** The select carries its own answer's colour, so the state reads at a glance
 *  down a column of eight without opening anything. */
const TONE: Record<CheckStatus, string> = {
  yes: "bg-success/10 text-success border-success/40",
  no: "bg-danger/10 text-danger border-danger/40",
  pending: "bg-panel text-muted border-border",
};

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
  // Rows showing their remark box. A remark already written keeps its own open.
  const [open, setOpen] = useState<string[]>([]);

  const entry = (item: string) => state.find((s) => s.item === item);

  const set = (item: string, patch: Partial<JourneyCheck>) =>
    setState((s) => {
      const found = s.find((x) => x.item === item);
      const next: JourneyCheck = {
        item,
        status: found?.status ?? "pending",
        note: found?.note,
        ...patch,
      };
      return [...s.filter((x) => x.item !== item), next];
    });

  if (items.length === 0) return null;

  // Pending with no remark is the starting state — nothing to record.
  const stored = state.filter(
    (s) => s.status !== "pending" || (s.note != null && s.note.trim() !== ""),
  );
  const count = (st: CheckStatus) =>
    items.filter((i) => (entry(i)?.status ?? "pending") === st).length;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(stored)} />

      <ul className="space-y-1">
        {items.map((item) => {
          const e = entry(item);
          const status: CheckStatus = e?.status ?? "pending";
          const note = e?.note ?? "";
          const showNote = note !== "" || open.includes(item);

          return (
            <li key={item} className="rounded-md px-2 py-1.5 hover:bg-elevated/60">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={`min-w-0 flex-1 text-[13px] ${
                    status === "pending" ? "text-muted" : "text-text"
                  }`}
                >
                  {item}
                </span>

                <div className="flex shrink-0 items-center gap-1.5">
                  <select
                    value={status}
                    onChange={(e2) =>
                      set(item, { status: e2.target.value as CheckStatus })
                    }
                    aria-label={item}
                    className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${TONE[status]}`}
                  >
                    {CHECK_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {LABELS[st]}
                      </option>
                    ))}
                  </select>

                  {!showNote && (
                    <button
                      type="button"
                      onClick={() => setOpen((o) => [...o, item])}
                      title={`Add a remark about "${item}"`}
                      aria-label={`Add a remark about ${item}`}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted/60 transition-colors hover:bg-elevated hover:text-text"
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </div>
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
        {count("yes")} yes · {count("no")} no · {count("pending")} pending
      </p>
    </div>
  );
}
