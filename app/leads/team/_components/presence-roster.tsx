"use client";

import Link from "next/link";
import { initials, colorFromName } from "@/lib/avatar";
import { ROLE_LABELS, type Role } from "@/lib/roles-shared";
import { presenceMeta, type Presence } from "@/lib/presence-shared";
import { PresenceDot, PresenceSelect } from "./presence-switcher";

export type RosterMember = {
  id: string;
  name: string;
  email: string;
  presence: Presence;
  roles: Role[];
};

function topRoleLabel(roles: Role[]): string {
  if (roles.includes("admin")) return ROLE_LABELS.admin;
  if (roles.includes("telecaller")) return ROLE_LABELS.telecaller;
  return roles[0] ? ROLE_LABELS[roles[0]] : "No role";
}

export function PresenceRoster({
  members,
  meId,
  isAdmin,
}: {
  members: RosterMember[];
  meId: string;
  isAdmin: boolean;
}) {
  return (
    <div className="card divide-y divide-border">
      {members.map((m) => {
        const canEdit = isAdmin || m.id === meId;
        const meta = presenceMeta(m.presence);
        return (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: colorFromName(m.id) }}
            >
              {initials(m.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{m.name}</span>
                {m.id === meId && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
                    you
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted">{topRoleLabel(m.roles)}</div>
            </div>
            <div className="flex items-center gap-3">
              {m.id !== meId && (
                <Link
                  href={`/leads/team/dm/${m.id}`}
                  className="text-xs text-muted hover:text-accentInk"
                >
                  Message
                </Link>
              )}
              {canEdit ? (
                <PresenceSelect userId={m.id} value={m.presence} />
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <PresenceDot value={m.presence} />
                  {meta.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {members.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-muted">No team members yet.</div>
      )}
    </div>
  );
}
