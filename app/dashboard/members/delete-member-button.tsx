"use client";

import { useActionState, useState } from "react";
import { deleteMemberAction } from "./actions";

export function DeleteMemberButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(deleteMemberAction, undefined);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">
        Danger zone
      </div>
      {state?.error && (
        <div className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {state.error}
        </div>
      )}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger hover:bg-danger/20"
        >
          Delete account
        </button>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={userId} />
          <span className="text-xs text-muted">
            Delete <span className="text-text">{name}</span>? This can’t be undone.
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger hover:bg-danger/20"
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-text"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
