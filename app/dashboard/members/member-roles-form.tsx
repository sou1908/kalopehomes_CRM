"use client";

import { useActionState } from "react";
import { updateMemberRolesAction } from "./actions";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/roles-shared";
import type { Role } from "@/lib/roles-shared";

export function MemberRolesForm({
  userId,
  roles,
  isSelf,
}: {
  userId: string;
  roles: Role[];
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(updateMemberRolesAction, undefined);

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        {ALL_ROLES.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-xs"
          >
            <input
              type="checkbox"
              name={`role_${r}`}
              defaultChecked={roles.includes(r)}
              className="accent-accent"
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </div>
      {isSelf && (
        <p className="text-[11px] text-muted">
          This is your own account — you can’t remove your last Lead Manager role.
        </p>
      )}
      {state?.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="text-xs text-success">Roles updated.</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary text-xs">
        {pending ? "Saving…" : "Save roles"}
      </button>
    </form>
  );
}
