"use client";

import { useState } from "react";

/**
 * Date plus an optional time for a follow-up.
 *
 * The time is typed, not picked. `datetime-local` and `type="time"` both render
 * in the browser's own locale, so on a machine set to 24-hour they show 18:00
 * with no way to change it — and a dropdown of every half hour is a lot of
 * scrolling to say "six".
 *
 * So: a plain text field that accepts how people actually write a time, and
 * echoes back what it understood. "6pm", "6:30 pm", "18:30" and "630pm" all
 * work. A bare number is read as a business hour — 6 is the evening, 10 is the
 * morning — and since the reading is shown, a wrong guess is obvious and one
 * keystroke from fixed.
 */

/** Free-typed time → "HH:mm" in 24-hour, or null when it can't be read. */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;

  let hour = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.[0]; // "a" | "p" | undefined
  if (mins > 59) return null;

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "p" && hour !== 12) hour += 12;
    if (suffix === "a" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  } else if (hour >= 1 && hour <= 7) {
    // Nobody schedules a callback for 3am; 1–7 typed bare means the afternoon.
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** "18:30" → "6:30 pm", for showing the reading back. */
function pretty(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function FollowUpPicker({
  defaultValue,
}: {
  /** Existing reminder as yyyy-mm-ddThh:mm, or "" when unset. */
  defaultValue: string;
}) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));
  const [timeText, setTimeText] = useState(() => {
    const t = defaultValue.slice(11, 16);
    // Midnight is how "no time given" is stored — don't show it as 12:00 am.
    return t && t !== "00:00" ? pretty(t) : "";
  });

  const parsed = parseTimeInput(timeText);
  const typedSomething = timeText.trim() !== "";
  const unreadable = typedSomething && parsed == null;

  // The action reads this. A time without a date is meaningless, so it's dropped.
  const combined = date ? (parsed ? `${date}T${parsed}` : date) : "";

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
          <input
            type="text"
            inputMode="text"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            disabled={!date}
            placeholder="6:00 pm"
            aria-label="Follow-up time"
            aria-invalid={unreadable || undefined}
            className={`input text-sm disabled:opacity-50 ${
              unreadable ? "border-danger focus:border-danger focus:ring-danger" : ""
            }`}
          />
        </label>
      </div>

      {/* Say what was understood, so a bare "6" meaning 6am is caught here
          rather than by a missed call. */}
      {date && (
        <p className="mt-1.5 text-[11px] text-muted">
          {unreadable ? (
            <span className="text-danger">
              Can&apos;t read “{timeText}”. Try 6pm, 6:30 pm or 18:30.
            </span>
          ) : parsed ? (
            <>
              Reminder set for <span className="text-text">{pretty(parsed)}</span>
            </>
          ) : (
            "No time — reminds you any time that day."
          )}
        </p>
      )}
    </div>
  );
}
