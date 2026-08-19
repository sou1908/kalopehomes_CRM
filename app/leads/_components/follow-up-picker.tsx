"use client";

import { useState } from "react";

/**
 * Date plus an optional time for a follow-up, as hour / minute / am-pm.
 *
 * Three boxes rather than `type="time"` because that control draws its picker
 * from the *browser's* locale — on a machine set to 24-hour it shows 18:00, and
 * no attribute, CSS or `lang` overrides it. Ours reads 12-hour whatever the
 * machine is set to.
 *
 * Leaving the hour on "—" means a whole-day reminder, which is stored as
 * midnight and displayed without a time.
 *
 * One consequence: picking 12 am exactly is indistinguishable from a whole-day
 * reminder, since both land on 00:00. Separating them would need a column to
 * record whether a time was given — not worth it for a midnight callback that
 * this business will never book.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** hour (1–12) + am/pm → the 0–23 hour to store. */
function to24(hour12: number, meridiem: "am" | "pm"): number {
  if (meridiem === "am") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function FollowUpPicker({
  defaultValue,
}: {
  /** Existing reminder as yyyy-mm-ddThh:mm, or "" when unset. */
  defaultValue: string;
}) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));

  // Midnight is how "no time given" is stored, so it starts as a whole-day
  // reminder rather than showing 12:00 am.
  const initial = defaultValue.slice(11, 16);
  const hasTime = Boolean(initial) && initial !== "00:00";
  const initialH24 = hasTime ? Number(initial.slice(0, 2)) : null;

  const [hour, setHour] = useState<string>(
    initialH24 == null ? "" : String(initialH24 % 12 === 0 ? 12 : initialH24 % 12),
  );
  const [minute, setMinute] = useState<string>(hasTime ? initial.slice(3, 5) : "00");
  const [meridiem, setMeridiem] = useState<"am" | "pm">(
    initialH24 != null && initialH24 < 12 ? "am" : "pm",
  );

  // The action reads this. A time with no date means nothing, so it's dropped.
  const time =
    hour === ""
      ? null
      : `${String(to24(Number(hour), meridiem)).padStart(2, "0")}:${minute}`;
  const combined = date ? (time ? `${date}T${time}` : date) : "";

  const box =
    "input px-2 py-2 text-sm disabled:opacity-50 [&>option]:bg-panel";

  return (
    <div>
      <input type="hidden" name="followUpAt" value={combined} />

      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input text-sm"
          aria-label="Follow-up date"
        />
      </label>

      <div className="mt-2">
        <span className="mb-1 block text-[11px] text-muted">Time</span>
        <div className="flex items-center gap-1.5">
          <select
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            disabled={!date}
            aria-label="Hour"
            className={box}
          >
            <option value="">—</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <span className="text-muted" aria-hidden>
            :
          </span>

          <select
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            disabled={!date || hour === ""}
            aria-label="Minute"
            className={box}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={meridiem}
            onChange={(e) => setMeridiem(e.target.value as "am" | "pm")}
            disabled={!date || hour === ""}
            aria-label="AM or PM"
            className={box}
          >
            <option value="am">am</option>
            <option value="pm">pm</option>
          </select>
        </div>
      </div>

      {date && hour === "" && (
        <p className="mt-1.5 text-[11px] text-muted">
          No time — reminds you any time that day.
        </p>
      )}
    </div>
  );
}
