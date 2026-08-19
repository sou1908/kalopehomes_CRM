"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Date plus an optional time for a follow-up.
 *
 * The time is ours, not the browser's. `type="time"` and `datetime-local` draw
 * their picker from the *browser's* locale — on a machine set to 24-hour they
 * show 18:00, and no attribute, CSS or `lang` overrides it. So the field is a
 * text input with our own list beside it: 12-hour throughout, whatever the
 * machine is set to.
 *
 * You can type or pick. Typing accepts how people actually write a time —
 * "6pm", "6:30 pm", "630pm", "18:30" — and narrows the list as you go. A bare
 * number is read as a business hour (6 is the evening, 10 the morning), which
 * is only safe because the reading is echoed back underneath.
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

/** "18:30" → "6:30 pm". */
function pretty(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** 7:00 am → 9:30 pm in half hours — the window anyone is actually called in. */
const TIMES: string[] = (() => {
  const out: string[] = [];
  for (let mins = 7 * 60; mins <= 21 * 60 + 30; mins += 30) {
    out.push(
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
    );
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
  const [timeText, setTimeText] = useState(() => {
    const t = defaultValue.slice(11, 16);
    // Midnight is how "no time given" is stored — don't show it as 12:00 am.
    return t && t !== "00:00" ? pretty(t) : "";
  });
  const [listOpen, setListOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const parsed = parseTimeInput(timeText);
  const typedSomething = timeText.trim() !== "";
  const unreadable = typedSomething && parsed == null;

  // Typing narrows the list; a valid time scrolls its own entry into view.
  const query = timeText.trim().toLowerCase().replace(/\s+/g, "");
  const shown = query
    ? TIMES.filter(
        (t) =>
          pretty(t).replace(/\s+/g, "").startsWith(query) ||
          t.startsWith(query) ||
          (parsed != null && t === parsed),
      )
    : TIMES;

  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setListOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [listOpen]);

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

        <div ref={boxRef} className="relative w-[7.5rem] shrink-0">
          <span className="mb-1 block text-[11px] text-muted">Time</span>
          <input
            type="text"
            value={timeText}
            onChange={(e) => {
              setTimeText(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            disabled={!date}
            placeholder="6:00 pm"
            aria-label="Follow-up time"
            aria-expanded={listOpen}
            aria-invalid={unreadable || undefined}
            autoComplete="off"
            className={`input text-sm disabled:opacity-50 ${
              unreadable ? "border-danger focus:border-danger focus:ring-danger" : ""
            }`}
          />

          {listOpen && date && shown.length > 0 && (
            <ul
              role="listbox"
              aria-label="Times"
              className="absolute right-0 z-50 mt-1 max-h-56 w-full min-w-[7rem] overflow-y-auto rounded-md border border-border bg-panel py-1 shadow-xl"
            >
              {shown.map((t) => {
                const on = parsed === t;
                return (
                  <li key={t}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => {
                        setTimeText(pretty(t));
                        setListOpen(false);
                      }}
                      className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                        on
                          ? "bg-accent/15 text-accentInk"
                          : "text-muted hover:bg-elevated hover:text-text"
                      }`}
                    >
                      {pretty(t)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
