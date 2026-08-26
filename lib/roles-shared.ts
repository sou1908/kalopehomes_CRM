// Client-safe role metadata and pure helpers. NO server-only / db imports here
// so client components (forms, switchers) can import these constants. The
// server-only DB lookups live in ./roles.ts, which re-exports everything here.

/**
 * The four staff roles. Each one owns a stretch of the process and, from the
 * pipeline redesign on, its own pipeline:
 *
 *   telecaller        → calls the lead, qualifies it, hands it on
 *   site_agent        → meets them at the property
 *   operation_manager → closes (its pipeline is still to be defined)
 *   admin             → sees and does everything
 *
 * Roles are stackable: a user holds a set of `user_roles` rows, and permissions
 * derive from the set rather than from one column.
 *
 * Renamed on 2026-08-19 — `super_admin` became `admin`, `field_agent` became
 * `site_agent`, and `operation_manager` was added. The old `team_member` and
 * `client` roles are gone entirely (this fork has neither a team workspace nor
 * a client portal). Existing rows are converted on boot in lib/db/index.ts.
 */
export type Role = "admin" | "telecaller" | "site_agent" | "operation_manager";

/** Every assignable role, in the order they appear in the process. */
export const ALL_ROLES: Role[] = [
  "telecaller",
  "site_agent",
  "operation_manager",
  "admin",
];

/** Roles the member editor can grant. Same set — there are no hidden roles. */
export const STAFF_ROLES: Role[] = ALL_ROLES;

/** Roles that work the leads CRM surface (everything under /leads). */
export const LEAD_SURFACE_ROLES: Role[] = ALL_ROLES;

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  telecaller: "Telecaller",
  site_agent: "Site Agent",
  operation_manager: "Operation Manager",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:
    "Full access — every pipeline, plus member, role and pipeline management.",
  telecaller: "Calls new leads, qualifies them and hands on the interested ones.",
  site_agent: "Meets prospects at the property and records how the visit went.",
  operation_manager: "Takes qualified leads through to close.",
};

/** Home surface for each role — everyone works in the leads CRM. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/leads",
  telecaller: "/leads",
  site_agent: "/leads",
  operation_manager: "/leads",
};

/**
 * Priority order for picking a default surface when a user holds several roles,
 * widest reach first.
 */
const ROLE_PRIORITY: Role[] = [
  "admin",
  "operation_manager",
  "site_agent",
  "telecaller",
];

/** True when `value` is one of the four current roles. */
export function isRole(value: string): value is Role {
  return (ALL_ROLES as string[]).includes(value);
}

export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role);
}

/** Admins bypass every per-role restriction. */
export function isAdmin(roles: Role[]): boolean {
  return roles.includes("admin");
}

/**
 * True when someone holding `roles` may work a pipeline open to `pipelineRoles`.
 *
 * The same rule `canWorkPipeline` in lib/pipelines.ts applies, kept here so the
 * browser can use it too — that module is server-only. One implementation, so
 * the list a form offers and the check the server makes cannot drift apart.
 */
export function rolesCanWorkPipeline(
  pipelineRoles: string[],
  roles: string[],
): boolean {
  if (roles.includes("admin")) return true;
  return pipelineRoles.some((r) => roles.includes(r));
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
