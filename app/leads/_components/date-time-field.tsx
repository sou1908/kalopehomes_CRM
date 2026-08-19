"use client";

import { useState } from "react";

/**
 * A date with an optional time, as hour / minute / am-pm boxes.
 *
 * Three selects rather than `type="datetime-local"` because that control draws
 * its picker from the *browser's* locale — on a machine set to 24-hour it shows
 * 18:00, and no attribute, CSS or `lang` overrides it. These read 12-hour
 * whatever the machine is set to.
 *
 * Submits `name` as `yyyy-mm-ddThh:mm`, or just `yyyy-mm-dd` when no hour is
 * chosen, or "" when there's no date at all.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** hour (1–12) + am/pm → the 0–23 hour to store. */
export function to24(hour12: number, meridiem: "am" | "pm"): number {
  if (meridiem === "am") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function DateTimeField({
  name,
  defaultValue,
  dateLabel = "Date",
  timeLabel = "Time",
  allDayHint,
}: {
  name: string;
  /** yyyy-mm-dd or yyyy-mm-ddThh:mm, "" when unset. */
  defaultValue: string;
  dateLabel?: string;
  timeLabel?: string;
  /** Shown when a date is set but no hour — omit for no hint. */
  allDayHint?: string;
}) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));

  // Midnight is how "no time given" is stored, so it starts as whole-day
  // rather than showing 12:00 am.
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

  const time =
    hour === ""
      ? null
      : `${String(to24(Number(hour), meridiem)).padStart(2, "0")}:${minute}`;
  const combined = date ? (time ? `${date}T${time}` : date) : "";

  const box = "input px-2 py-2 text-sm disabled:opacity-50";

  return (
    <div>
      <input type="hidden" name={name} value={combined} />

      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">{dateLabel}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input text-sm"
          aria-label={dateLabel}
        />
      </label>

      <div className="mt-2">
        <span className="mb-1 block text-[11px] text-muted">{timeLabel}</span>
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

      {allDayHint && date && hour === "" && (
        <p className="mt-1.5 text-[11px] text-muted">{allDayHint}</p>
      )}

      {/* Midnight and "no time" are the same stored value, so say so rather
          than quietly turning one into the other. */}
      {date && hour === "12" && minute === "00" && meridiem === "am" && (
        <p className="mt-1.5 text-[11px] text-muted">
          12:00 am is stored without a time — it will show as{" "}
          <span className="text-text">just the date</span>.
        </p>
      )}
    </div>
  );
}
