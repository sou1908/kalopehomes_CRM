"use client";

import { useState } from "react";
import {
  parseJourneySections,
  type JourneyColumn,
  type JourneyRow,
  type JourneySection,
} from "@/lib/leads-shared";
import { Icon } from "@/app/_components/icons";

/**
 * Named groups, each with its own rows — measurements taken area by area.
 *
 * A flat table forced the agent to repeat "Kitchen" on every line and gave the
 * office no way to see where one area's numbers ended and the next began. You
 * name what you measured, and that area gets its own block.
 *
 * Submits `name` as JSON: [{ name, rows: [{ column key → value }] }].
 */
export function SectionsField({
  name,
  columns,
  defaultValue,
  suggestions = [],
  addLabel = "Add area",
}: {
  name: string;
  /** The columns inside each section. */
  columns: JourneyColumn[];
  defaultValue: string;
  /** Offered in the name box — not a fixed list, anything can be typed. */
  suggestions?: string[];
  addLabel?: string;
}) {
  const [sections, setSections] = useState<JourneySection[]>(() =>
    parseJourneySections(defaultValue),
  );
  const [draft, setDraft] = useState("");

  const addSection = (title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setSections((s) => [...s, { name: clean, rows: [blank(columns)] }]);
    setDraft("");
  };

  const updateRow = (si: number, ri: number, key: string, value: string) =>
    setSections((s) =>
      s.map((sec, i) =>
        i !== si
          ? sec
          : {
              ...sec,
              rows: sec.rows.map((r, x) => (x === ri ? { ...r, [key]: value } : r)),
            },
      ),
    );

  // Only rows with something in them are worth storing, and a section with no
  // rows left is just its name — still worth keeping, it says it was measured.
  const cleaned = sections.map((sec) => ({
    name: sec.name,
    rows: sec.rows.filter((r) => Object.values(r).some((v) => v.trim() !== "")),
  }));

  const listId = `${name}-areas`;

  // Suggested areas not already on the form. Compared case-insensitively so
  // typing "kitchen" by hand still removes the Kitchen chip.
  const taken = new Set(sections.map((s) => s.name.trim().toLowerCase()));
  const unused = suggestions.filter((o) => !taken.has(o.trim().toLowerCase()));

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />

      <div className="space-y-2">
        {sections.map((sec, si) => (
          <div key={si} className="rounded-lg border border-border bg-panel/50 p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={sec.name}
                onChange={(e) =>
                  setSections((s) =>
                    s.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)),
                  )
                }
                aria-label="Area measured"
                className="input flex-1 px-2 py-1 text-sm font-medium"
              />
              <button
                type="button"
                onClick={() => setSections((s) => s.filter((_, i) => i !== si))}
                aria-label={`Remove ${sec.name}`}
                title="Remove this area"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-danger"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className={`pb-1 pr-2 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-muted ${
                          c.narrow ? "w-[4.5rem]" : ""
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((row, ri) => (
                    <tr key={ri}>
                      {columns.map((c) => (
                        <td key={c.key} className="pb-1.5 pr-2 align-top">
                          {c.options ? (
                            <select
                              value={row[c.key] ?? ""}
                              onChange={(e) => updateRow(si, ri, c.key, e.target.value)}
                              aria-label={c.label}
                              className="input px-2 py-1.5 text-sm"
                            >
                              <option value="">—</option>
                              {c.options.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={row[c.key] ?? ""}
                              onChange={(e) => updateRow(si, ri, c.key, e.target.value)}
                              aria-label={`${c.label}, ${sec.name} row ${ri + 1}`}
                              className="input px-2 py-1.5 text-sm"
                            />
                          )}
                        </td>
                      ))}
                      <td className="pb-1.5 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setSections((s) =>
                              s.map((x, i) =>
                                i !== si
                                  ? x
                                  : {
                                      ...x,
                                      rows:
                                        x.rows.length === 1
                                          ? [blank(columns)]
                                          : x.rows.filter((_, y) => y !== ri),
                                    },
                              ),
                            )
                          }
                          aria-label={`Remove row ${ri + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-danger"
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() =>
                setSections((s) =>
                  s.map((x, i) =>
                    i === si ? { ...x, rows: [...x.rows, blank(columns)] } : x,
                  ),
                )
              }
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <Icon name="plus" size={11} />
              Add row
            </button>
          </div>
        ))}
      </div>

      {/* Naming what you measured is what opens the block.
          The suggested areas used to be a datalist — invisible unless you
          happened to start typing, so on site nobody found them. They are
          buttons now: one tap adds the area, and an area already added drops
          off the row rather than offering a duplicate. */}
      {unused.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {unused.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => addSection(o)}
              title={`Add ${o}`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:bg-elevated hover:text-text"
            >
              <Icon name="plus" size={11} />
              {o}
            </button>
          ))}
        </div>
      )}

      {/* Anything not on the list — no site is only ever the same eight rooms. */}
      <div className="mt-2 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSection(draft);
            }
          }}
          list={suggestions.length > 0 ? listId : undefined}
          placeholder="Something else…"
          aria-label="Area to measure"
          className="input max-w-[14rem] px-2 py-1.5 text-sm"
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
        <button
          type="button"
          onClick={() => addSection(draft)}
          disabled={draft.trim() === ""}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-text disabled:opacity-40"
        >
          <Icon name="plus" size={12} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function blank(columns: JourneyColumn[]): JourneyRow {
  return Object.fromEntries(columns.map((c) => [c.key, ""]));
}
