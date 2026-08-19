import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserWithRoles } from "@/lib/auth";
import { defaultSurface } from "@/lib/roles";
import { logoutAction } from "@/app/(auth)/actions";
import { ThemeToggle } from "@/app/_components/theme-toggle";

// Admin area — members & roles only. Gated to super_admin.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithRoles();
  if (!user) redirect("/login");
  if (!user.roles.includes("super_admin")) redirect(defaultSurface(user.roles));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            Kalope <span className="text-accentInk">Homes</span>
          </Link>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leads" className="text-xs text-muted hover:text-text">
            ← Back to CRM
          </Link>
          <ThemeToggle />
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
      <main>{children}</main>
    </div>
  );
}
