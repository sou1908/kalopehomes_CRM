// Client-safe role metadata and pure helpers. NO server-only / db imports here
// so client components (forms, switchers) can import these constants. The
// server-only DB lookups live in ./roles.ts, which re-exports everything here.

export type Role =
  | "super_admin"
  | "team_member"
  | "telecaller"
  | "field_agent"
  | "client";

// Staff roles an admin can assign in the CRM. The top role (full access) is the
// Lead Manager — internally still `super_admin`, just relabelled. Telecallers are
// the L1 callers; Field Agents do site visits (L2). All work the same pipeline.
// (team_member/client exist in the schema enum for compatibility but aren't used.)
export const ALL_ROLES: Role[] = ["super_admin", "telecaller", "field_agent"];
// Staff roles whose membership the role editor manages.
export const STAFF_ROLES: Role[] = [
  "super_admin",
  "telecaller",
  "field_agent",
  "team_member",
];

// Roles that work the leads CRM surface (everything under /leads).
export const LEAD_SURFACE_ROLES: Role[] = [
  "super_admin",
  "telecaller",
  "field_agent",
];

export const ROLE_LABELS: Record<Role, string> = {
  // The owner/manager. Internally super_admin (full access); shown as Lead Manager.
  super_admin: "Lead Manager",
  team_member: "Team Member",
  telecaller: "Telecaller",
  field_agent: "Field Agent",
  client: "Client",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin:
    "Full access — the whole pipeline plus member, role & team management.",
  team_member: "Team member (unused in this CRM).",
  telecaller: "L1 caller — phones leads, logs calls. Collaborates with the team.",
  field_agent: "L2 site visits — meets prospects in person and logs visits.",
  client: "Client (unused in this CRM).",
};

/** Home surface for each role — everyone works in the leads CRM. */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/leads",
  telecaller: "/leads",
  field_agent: "/leads",
  team_member: "/leads",
  client: "/no-access",
};

/**
 * Priority order for picking a default surface when a user holds several roles.
 * Higher reach first: an admin lands on the admin dashboard, etc.
 */
const ROLE_PRIORITY: Role[] = [
  "super_admin",
  "telecaller",
  "field_agent",
  "team_member",
];

export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role);
}

/** Where to send a user after login, based on the roles they hold. */
export function defaultSurface(roles: Role[]): string {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return ROLE_HOME[r];
  }
  // No role assigned yet — keep them on a safe landing page.
  return "/no-access";
}

/** Surfaces a user is allowed to switch between, in priority order. */
export function availableSurfaces(
  roles: Role[],
): Array<{ role: Role; label: string; href: string }> {
  return ROLE_PRIORITY.filter((r) => roles.includes(r)).map((r) => ({
    role: r,
    label: ROLE_LABELS[r],
    href: ROLE_HOME[r],
  }));
}
