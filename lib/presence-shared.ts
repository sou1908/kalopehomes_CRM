// Client-safe presence metadata. No server/db imports so client components
// (the roster + the sidebar switcher) can import it directly.

export type Presence = "available" | "busy" | "on_call" | "offline";

// Order shown in pickers (most-available first).
export const PRESENCE_ORDER: Presence[] = [
  "available",
  "on_call",
  "busy",
  "offline",
];

export const PRESENCE_META: Record<Presence, { label: string; color: string }> = {
  available: { label: "Available", color: "#22c55e" },
  on_call: { label: "On call", color: "#f59e0b" },
  busy: { label: "Busy", color: "#ef4444" },
  offline: { label: "Offline", color: "#6b7280" },
};

export function presenceMeta(p: string | null | undefined) {
  return PRESENCE_META[(p as Presence) ?? "offline"] ?? PRESENCE_META.offline;
}
