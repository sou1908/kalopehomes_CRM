"use client";

import { useState } from "react";
import { parseJourneyRows, type JourneyColumn, type JourneyRow } from "@/lib/leads-shared";
import { Icon } from "@/app/_components/icons";

/**
 * A repeatable table for a journey question — measurements, what goes where.
 *
 * These are lists, not prose. Typed into a textarea, "kitchen 8x9, wardrobe
 * 6x7" is a paragraph nobody can total, filter, or build a quotation from. As
 * rows the numbers stay numbers.
 *
 * Submits `name` as a JSON array of {column key → value}. Blank rows are
 * dropped on save, so an empty extra row costs nothing.
 */
export function RowsField({
  name,
  columns,
  defaultValue,
  addLabel = "Add row",
}: {
  name: string;
  columns: JourneyColumn[];
  /** Existing value as the stored JSON string. */
  defaultValue: string;
  addLabel?: string;
}) {
  const [rows, setRows] = useState<JourneyRow[]>(() => {
    const existing = parseJourneyRows(defaultValue);
    return existing.length > 0 ? existing : [blank(columns)];
  });

  const update = (index: number, key: string, value: string) =>
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [key]: value } : r)));

  // Only rows with something in them are worth storing.
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim() !== ""));

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(filled)} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-sm">
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
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className="pb-1.5 pr-2 align-top">
                    {c.options ? (
                      <select
                        value={row[c.key] ?? ""}
                        onChange={(e) => update(i, c.key, e.target.value)}
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
                        onChange={(e) => update(i, c.key, e.target.value)}
                        aria-label={`${c.label}, row ${i + 1}`}
                        className="input px-2 py-1.5 text-sm"
                      />
                    )}
                  </td>
                ))}
                <td className="pb-1.5 align-top">
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) =>
                        rs.length === 1
                          ? [blank(columns)]
                          : rs.filter((_, x) => x !== i),
                      )
                    }
                    aria-label={`Remove row ${i + 1}`}
                    title="Remove this row"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-danger"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blank(columns)])}
        className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-text"
      >
        <Icon name="plus" size={12} />
        {addLabel}
      </button>
    </div>
  );
}

function blank(columns: JourneyColumn[]): JourneyRow {
  return Object.fromEntries(columns.map((c) => [c.key, ""]));
}
