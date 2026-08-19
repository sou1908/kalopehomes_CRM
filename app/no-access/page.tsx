import { redirect } from "next/navigation";
import { getCurrentUserWithRoles } from "@/lib/auth";
import { defaultSurface } from "@/lib/roles";
import { logoutAction } from "@/app/(auth)/actions";

export default async function NoAccessPage() {
  const user = await getCurrentUserWithRoles();
  if (!user) redirect("/login");
  // If they actually have a role, send them to it.
  if (user.roles.length > 0) redirect(defaultSurface(user.roles));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-3xl">🔑</div>
      <h1 className="text-xl font-semibold tracking-tight">No access yet</h1>
      <p className="mt-2 text-sm text-muted">
        Your account ({user.email}) doesn’t have a role assigned. Ask your
        administrator to grant you access.
      </p>
      <form action={logoutAction} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-1.5 text-sm text-muted hover:text-text"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
