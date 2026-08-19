// Pure avatar helpers — no server-only/db imports, safe on client and server.

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "#f97316",
  "#10b981",
  "#6a89a8",
  "#d99756",
  "#b85a3d",
  "#7c9e6d",
  "#8b5cf6",
  "#ec4899",
];

/** Deterministic avatar color from a name/id, so a user always gets the same one. */
export function colorFromName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
