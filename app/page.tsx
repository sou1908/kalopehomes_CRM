import { redirect } from "next/navigation";
import { getCurrentUserWithRoles } from "@/lib/auth";
import { defaultSurface } from "@/lib/roles";

export default async function HomePage() {
  const user = await getCurrentUserWithRoles();
  redirect(user ? defaultSurface(user.roles) : "/login");
}
