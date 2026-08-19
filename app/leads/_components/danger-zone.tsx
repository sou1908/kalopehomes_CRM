"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllLeadsAction } from "../actions";

/**
 * ⚠️ TEMPORARY — TESTING ONLY, REMOVE BEFORE LAUNCH.
 *
 * Empties the lead table so a fresh import can be tried against a clean slate.
 * Deletes every lead in the workspace, not just the ones the current filter
 * happens to show.
 *
 * Two gates before anything happens: the dialog has to be opened, and the
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Testing only — delete every lead in this workspace"
        className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 px-2.5 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
      >
        Delete all leads
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-danger/40 bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-danger">
                Testing only
              </span>
              <h2 className="mt-1 font-display text-xl font-medium">
                Delete all {count} leads
              </h2>
            </div>

            <form action={action} className="px-5 py-4">
              <p className="text-sm leading-relaxed text-muted">
                This permanently deletes{" "}
                <span className="text-text">every lead in this workspace</span> —
                all pipelines, not just the ones showing — along with their
                activities, assignees, tags and pipeline history.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                A full snapshot of the database is saved to{" "}
                <span className="font-mono text-[11px] text-text">data/backups/</span>{" "}
                first, so this is recoverable if it turns out to be a mistake.
              </p>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[11px] text-muted">
                  Type <span className="font-mono text-danger">DELETE ALL LEADS</span>{" "}
                  to confirm
                </span>
                <input
                  name="confirm"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  placeholder="DELETE ALL LEADS"
                  className="input text-sm"
                />
              </label>

              {state?.error && (
                <p className="mt-2 text-xs text-danger">{state.error}</p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={pending || typed.trim() !== "DELETE ALL LEADS"}
                  className="rounded-md bg-danger px-3 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-40"
                >
                  {pending ? "Deleting…" : `Delete ${count} leads`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTyped("");
                  }}
                  className="rounded-md border border-border px-3 py-2 text-xs text-muted transition-colors hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
