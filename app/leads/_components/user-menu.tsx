"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { initials } from "@/lib/avatar";
import { Icon } from "@/app/_components/icons";
import { PresenceSelect } from "../team/_components/presence-switcher";
import type { Presence } from "@/lib/presence-shared";

/**
 * Account controls for the page's top-right corner: who you're signed in as,
 * your availability, and the way out.
 *
 * These used to sit at the foot of the sidebar, which put the least-used
 * controls in the most permanent place and cost three rows of every screen.
 * Top-right is where people look for their account, and folding it into a menu
 * gives the presence picker room to be readable rather than squeezed.
 */
export function UserMenu({
  user,
}: {
  user: { id: string; name: string; email: string; presence: Presence };
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`${user.name} · ${user.email}`}
        className={`flex items-center gap-1.5 rounded-md border py-1 pl-1 pr-1.5 transition-colors ${
          open
            ? "border-accent/50 bg-panel"
            : "border-border hover:border-accent/50 hover:bg-panel"
        }`}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accentInk">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-xs text-text sm:block">
          {user.name}
        </span>
        <span className="text-muted">
          <Icon name="chevronRight" size={12} className="rotate-90" />
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-lg border border-border bg-panel p-3 shadow-xl">
            <div className="flex items-center gap-2.5 border-b border-border pb-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accentInk">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted">{user.email}</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 py-3">
              <span className="text-xs text-muted">Status</span>
              <PresenceSelect userId={user.id} value={user.presence} />
            </div>

            <form action={logoutAction} className="border-t border-border pt-2">
              <button
                type="submit"
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted transition-colors hover:bg-elevated hover:text-text"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
