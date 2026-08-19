"use client";

import { useEffect, useState } from "react";

/**
 * Light / dark control. Three states — "system" follows the device preference
 * (the default, and what the CSS does on its own); "light" and "dark" pin the
 * scheme by setting `data-theme` on <html>, which overrides the media query in
 * globals.css. The choice is stored in localStorage and re-applied before paint
 * by the inline script in app/layout.tsx, so there's no flash on reload.
 */

export type ThemeChoice = "system" | "light" | "dark";

const OPTIONS: Array<{ value: ThemeChoice; icon: string; label: string }> = [
  { value: "system", icon: "🖥", label: "Match device" },
  { value: "light", icon: "☀", label: "Light" },
  { value: "dark", icon: "☾", label: "Dark" },
];

export const THEME_STORAGE_KEY = "kalope-theme";

function applyChoice(next: ThemeChoice) {
  try {
    if (next === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
  } catch {
    // Private mode / storage disabled — the toggle still works for this page.
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
  }
}

function readStored(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** Segmented control — for the expanded sidebar footer. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Server renders "system"; correct to the stored value once mounted.
  useEffect(() => setChoice(readStored()), []);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
    >
      {OPTIONS.map((o) => {
        const on = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={on}
            onClick={() => {
              setChoice(o.value);
              applyChoice(o.value);
            }}
            className={`rounded px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
              on ? "bg-accent text-black" : "text-muted hover:text-text"
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

/** Single cycling button — for the collapsed icon rail. */
export function ThemeToggleIcon() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => setChoice(readStored()), []);

  const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[0];
  const next = OPTIONS[(OPTIONS.findIndex((o) => o.value === choice) + 1) % OPTIONS.length];

  return (
    <button
      type="button"
      title={`Theme: ${current.label} — switch to ${next.label}`}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
      onClick={() => {
        setChoice(next.value);
        applyChoice(next.value);
      }}
      className="flex h-10 w-10 items-center justify-center rounded-md text-sm text-muted hover:bg-panel hover:text-text"
    >
      <span>{current.icon}</span>
    </button>
  );
}
