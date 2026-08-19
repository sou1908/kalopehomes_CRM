import { requireRole } from "@/lib/auth";
import { listMembers } from "@/lib/members";
import { ROLE_LABELS } from "@/lib/roles";
import { initials } from "@/lib/avatar";
import { CreateMemberForm } from "./create-member-form";
import { MemberRolesForm } from "./member-roles-form";
import { DeleteMemberButton } from "./delete-member-button";

export default async function MembersPage() {
  // Dashboard layout already gates admin, but re-assert here so this page
  // is safe even if linked directly, and to get the admin's org + id.
  const admin = await requireRole(["admin"]);
  const allMembers = admin.orgId ? await listMembers(admin.orgId) : [];

  // Every account is staff now — there is no client role in this CRM.
  const staff = allMembers;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">
        Settings
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Members &amp; roles</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Create login accounts for the people on your team. The{" "}
        <strong className="text-text">Lead Manager</strong> has full access
        (pipeline, members &amp; team management); <strong className="text-text">
        Telecallers</strong> work the leads and collaborate with the team. Roles
        are stackable, so one person can hold both.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Create a member account</h2>
        <CreateMemberForm />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium">
          Team &amp; admins <span className="ml-1 text-muted">({staff.length})</span>
        </h2>
        <div className="card divide-y divide-border">
          {staff.map((m) => (
            <details key={m.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-semibold text-accentInk">
                  {initials(m.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {m.name}
                    {m.id === admin.id && (
                      <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
                        you
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                  {m.roles.length === 0 ? (
                    <span className="text-[11px] text-muted">No roles</span>
                  ) : (
                    m.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted"
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))
                  )}
                </div>
                <span className="text-xs text-muted group-open:hidden">Edit ›</span>
                <span className="hidden text-xs text-muted group-open:inline">
                  Close ▾
                </span>
              </summary>
              <MemberRolesForm
                userId={m.id}
                roles={m.roles}
                isSelf={m.id === admin.id}
              />
              {m.id !== admin.id && (
                <DeleteMemberButton userId={m.id} name={m.name} />
              )}
            </details>
          ))}
        </div>
      </section>

    </div>
  );
}
