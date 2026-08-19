"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createLeadAction } from "../actions";
import { LEAD_SOURCES, LEAD_PURPOSES, type LeadStageInfo } from "@/lib/leads-shared";
import { SelectOrOther } from "./select-or-other";

export function LeadComposer({
  stages,
  triggerClassName,
  triggerLabel = "＋ New lead",
}: {
  stages: LeadStageInfo[];
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [state, action, pending] = useActionState(createLeadAction, undefined);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  // Portal target — only after mount (avoids SSR document access).
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      if (createMore) {
        setFormKey((k) => k + 1); // remount → clears fields, modal stays open
      } else {
        setOpen(false);
        router.refresh();
      }
    }
  }, [state, createMore, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "btn-primary text-xs"}
      >
        {triggerLabel}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-5 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                <span className="text-muted">New lead</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <form key={formKey} action={action} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="lc-name">Contact name</label>
                  <input id="lc-name" name="name" required autoFocus className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="lc-company">Company</label>
                  <input id="lc-company" name="company" className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="lc-email">Email</label>
                  <input id="lc-email" name="email" type="email" className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="lc-phone">Phone</label>
                  <input id="lc-phone" name="phone" className="input text-sm" />
                </div>
                <SelectOrOther name="purpose" label="Purpose — what they want built" options={LEAD_PURPOSES} />
                <div>
                  <label className="label" htmlFor="lc-value">Estimated value (₹)</label>
                  <input
                    id="lc-value"
                    name="estimatedValue"
                    inputMode="numeric"
                    placeholder="20000"
                    className="input text-sm"
                  />
                </div>
              </div>

              <fieldset className="space-y-3 rounded-md border border-border p-3">
                <legend className="px-1 text-[11px] uppercase tracking-wide text-muted">Address</legend>
                <div>
                  <label className="label" htmlFor="lc-address">Street / Area</label>
                  <textarea
                    id="lc-address"
                    name="address"
                    rows={2}
                    placeholder="Flat / building, street, area / locality"
                    className="input text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="lc-city">City</label>
                    <input id="lc-city" name="city" className="input text-sm" />
                  </div>
                  <div>
                    <label className="label" htmlFor="lc-state">State</label>
                    <input id="lc-state" name="state" className="input text-sm" />
                  </div>
                  <div>
                    <label className="label" htmlFor="lc-pincode">PIN code</label>
                    <input id="lc-pincode" name="pincode" inputMode="numeric" className="input text-sm" />
                  </div>
                  <div>
                    <label className="label" htmlFor="lc-country">Country</label>
                    <input id="lc-country" name="country" placeholder="India" className="input text-sm" />
                  </div>
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectOrOther name="source" label="Source" options={LEAD_SOURCES} />
                <div>
                  <label className="label" htmlFor="lc-stage">Stage</label>
                  <select
                    id="lc-stage"
                    name="stageId"
                    defaultValue={stages[0]?.id ?? ""}
                    className="input text-sm"
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="lc-notes">Notes</label>
                <textarea
                  id="lc-notes"
                  name="notes"
                  rows={3}
                  placeholder="What do they need? Budget, timeline, context…"
                  className="input text-sm"
                />
              </div>

              {state?.error && (
                <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {state.error}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={createMore}
                    onChange={(e) => setCreateMore(e.target.checked)}
                    className="accent-accent"
                  />
                  Create more
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={pending} className="btn-primary text-sm">
                    {pending ? "Adding…" : "Add lead"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
