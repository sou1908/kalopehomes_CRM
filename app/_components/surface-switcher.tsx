import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { availableSurfaces } from "@/lib/roles";
import type { Role } from "@/lib/roles";

/**
 * Top bar for the member-facing surfaces (team workspace, leads CRM). Shows the
 * surfaces this user can reach — a user holding several roles can switch between
 * them here — plus who they are and a sign-out.
 */
export function SurfaceSwitcher({
  roles,
  userName,
  current,
}: {
  roles: Role[];
  userName: string;
  current: string;
}) {
  const surfaces = availableSurfaces(roles);

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
      <div className="flex items-center gap-1.5">
        <Link href="/" className="mr-3 flex items-center gap-2 font-mono text-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" />
          Kalope <span className="text-accentInk">Homes</span>
        </Link>
        {surfaces.length > 1 && (
          <nav className="flex items-center gap-1 rounded-lg border border-border bg-panel p-0.5">
            {surfaces.map((s) => (
              <Link
                key={s.role}
                href={s.href}
                className={
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                  (s.href.includes(current)
                    ? "bg-accent text-black"
                    : "text-muted hover:text-text")
                }
              >
                {s.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted sm:inline">{userName}</span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:text-text"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
