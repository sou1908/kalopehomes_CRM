"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { undoTransferAction } from "../actions";

/**
 * Puts a lead back where it was before its last transfer — for the wrong
 * person, the wrong pipeline, or sending it too early.
 *
 * Shown to whoever works the pipeline it came from, since once a lead moves on
 * they can no longer act on it and would otherwise have no way to correct a
 * mistake they just made.
 */
export function UndoTransfer({ leadId, fromName }: { leadId: string; fromName: string }) {
  const [state, action, pending] = useActionState(undoTransferAction, undefined);
  const router = useRouter();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== handled.current) {
      handled.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-marigold/50 px-2.5 py-1 text-[11px] text-marigold transition-colors hover:bg-marigold/10 disabled:opacity-50"
      >
        {pending ? "Undoing…" : `↩ Undo transfer — back to ${fromName}`}
      </button>
      {state?.error && (
        <p className="mt-1.5 text-[11px] text-danger">{state.error}</p>
      )}
    </form>
  );
}
