"use client";

import { useState } from "react";

/**
 * Date plus an optional time for a follow-up.
 *
 * Not `datetime-local`: that control renders in the browser's own locale, so on
 * a machine set to 24-hour it shows 18:00 with no way to change it. Callers
 * think in "half six", so the time is a list of half-hours in 12-hour form —
 * which is also faster than typing, since callbacks land on the half hour far
 * more often than at 6:07.
 *
 * The two fields are combined into the `followUpAt` value the action reads.
 * No date means no reminder; a date with no time means the whole day.
 */

/** 7:00 am → 9:30 pm in half hours — the window anyone is actually called in. */
const TIMES: Array<{ value: string; label: string }> = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let mins = 7 * 60; mins <= 21 * 60 + 30; mins += 30) {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const suffix = h24 < 12 ? "am" : "pm";
    out.push({
      value: `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      label: `${h12}:${String(m).padStart(2, "0")} ${suffix}`,
    });
  }
  return out;
})();

export function FollowUpPicker({
  defaultValue,
}: {
  /** Existing reminder as yyyy-mm-ddThh:mm, or "" when unset. */
  defaultValue: string;
}) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));
  const [time, setTime] = useState(() => {
    const t = defaultValue.slice(11, 16);
    // Midnight is how "no time given" is stored, so don't show it as 12:00 am.
    return t && t !== "00:00" ? t : "";
  });

  // The action reads this. Time without a date is meaningless, so it's dropped.
  const combined = date ? (time ? `${date}T${time}` : date) : "";

  return (
    <div>
      <input type="hidden" name="followUpAt" value={combined} />

      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input text-sm"
            aria-label="Follow-up date"
          />
        </label>

        <label className="w-[7.5rem] shrink-0">
          <span className="mb-1 block text-[11px] text-muted">Time</span>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!date}
            className="input text-sm disabled:opacity-50"
            aria-label="Follow-up time"
          >
            <option value="">All day</option>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
