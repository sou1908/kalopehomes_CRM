"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllLeadsAction } from "../actions";

/**
 * ⚠️ TEMPORARY — TESTING ONLY, REMOVE BEFORE LAUNCH.
 *
 * Empties the lead table so a fresh import can be tried against a clean slate.
 * Two gates before anything happens: the panel has to be opened, and the
 * confirmation phrase typed exactly. A snapshot of the database is written
 * first, so a mistake is recoverable — see lib/danger.ts.
 */
export function DangerZone({ count }: { count: number }) {
  const [state, action, pending] = useActionState(deleteAllLeadsAction, undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const router = useRouter();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== handled.current) {
      handled.current = state;
      setOpen(false);
      setTyped("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="mt-10 rounded-lg border border-dashed border-danger/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-danger">
            Testing only
          </h2>
          <p className="mt-1 text-xs text-muted">
            Delete every lead in this workspace so you can re-import from a clean
            slate. Remove this panel before the site goes live.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-danger/50 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
          >
            Delete all {count} leads
          </button>
        )}
      </div>

      {open && (
        <form action={action} className="mt-4 border-t border-danger/30 pt-4">
          <p className="text-xs leading-relaxed text-text">
            This permanently deletes <strong>{count} leads</strong> and everything
            attached to them — activities, assignees, tags and pipeline history.
            A snapshot of the database is saved to{" "}
            <span className="font-mono text-[11px]">data/backups/</span> first.
          </p>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-muted">
              Type <span className="font-mono text-danger">DELETE ALL LEADS</span> to
              confirm
            </span>
            <input
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder="DELETE ALL LEADS"
              className="input max-w-xs text-sm"
            />
          </label>

          {state?.error && (
            <p className="mt-2 text-xs text-danger">{state.error}</p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || typed.trim() !== "DELETE ALL LEADS"}
              className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
            >
              {pending ? "Deleting…" : `Delete ${count} leads`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
