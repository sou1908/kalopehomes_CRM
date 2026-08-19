"use client";

import { useState, type ReactNode } from "react";

export type RailTab = {
  id: string;
  label: string;
  /** Optional dot color shown before the label (e.g. an alert state). */
  dot?: string;
  content: ReactNode;
};

/** Segmented tab switcher for the lead detail right rail. */
export function RailTabs({ tabs, initialId }: { tabs: RailTab[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div className="flex gap-1 rounded-lg border border-border bg-panel p-1">
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                on ? "bg-accent text-black" : "text-muted hover:text-text"
              }`}
            >
              {t.dot && (
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
              )}
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3">{current?.content}</div>
    </div>
  );
}
