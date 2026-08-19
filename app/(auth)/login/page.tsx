import { redirect } from "next/navigation";
import { getCurrentUserWithRoles } from "@/lib/auth";
import { defaultSurface } from "@/lib/roles";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const u = await getCurrentUserWithRoles();
  if (u) redirect(defaultSurface(u.roles));
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-8 text-sm text-muted">
        Sign in with your account. You’ll land on your workspace automatically.
      </p>
      <LoginForm />
    </>
  );
}
