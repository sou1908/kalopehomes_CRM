"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { initials, colorFromName } from "@/lib/avatar";
import { PresenceDot } from "./presence-switcher";
import type { Presence } from "@/lib/presence-shared";

export type ConversationPeer = {
  id: string;
  name: string;
  presence: Presence;
  unread: number;
};

export function ConversationsRail({
  peers,
  teamUnread,
}: {
  peers: ConversationPeer[];
  teamUnread: number;
}) {
  const pathname = usePathname();
  const onTeam = pathname === "/leads/team";

  return (
    <aside className="shrink-0 border-b border-border bg-sunken lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Messages</h2>
      </div>
      <nav className="space-y-0.5 p-2">
        <Link
          href="/leads/team"
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
            onTeam ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
          }`}
        >
          <span className="text-xs">＃</span>
          Team room
          {teamUnread > 0 && (
            <span className="ml-auto rounded-full bg-danger/20 px-1.5 text-[11px] text-danger">
              {teamUnread}
            </span>
          )}
        </Link>

        <div className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-wide text-muted">
          Direct messages
        </div>
        {peers.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted">No teammates yet.</div>
        )}
        {peers.map((p) => {
          const active = pathname === `/leads/team/dm/${p.id}`;
          return (
            <Link
              key={p.id}
              href={`/leads/team/dm/${p.id}`}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
              }`}
            >
              <span className="relative">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: colorFromName(p.id) }}
                >
                  {initials(p.name)}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-sunken">
                  <PresenceDot value={p.presence} />
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.unread > 0 && (
                <span className="rounded-full bg-danger/20 px-1.5 text-[11px] text-danger">
                  {p.unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
