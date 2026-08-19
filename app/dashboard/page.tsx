import { redirect } from "next/navigation";

// The CRM has no issues dashboard — send admins to the members admin.
export default function DashboardHome() {
  redirect("/dashboard/members");
}
