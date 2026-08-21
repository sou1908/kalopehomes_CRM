"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeadAction } from "../actions";
import {
  LEAD_SOURCES,
  LEAD_PURPOSES,
  LEAD_CITIES,
  LEAD_STATES,
} from "@/lib/leads-shared";
import { SelectOrOther } from "./select-or-other";
import type { Lead } from "@/lib/db/schema";

/**
 * The lead's contact details, reached from two buttons in the page header
 * rather than a permanent column — the details are reference material, while
 * the page itself is for working the lead (activity, journey, handover).
 *
 * View opens them read-only; Edit opens the form. View can hand straight over
 * to Edit, so checking a number and then correcting it is one flow.
 */
export function LeadDetails({ lead }: { lead: Lead }) {
  const [state, action, pending] = useActionState(updateLeadAction, undefined);
  const [mode, setMode] = useState<"closed" | "view" | "edit">("closed");
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  // Close the editor + refresh once a save succeeds.
  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      setMode("closed");
      router.refresh();
    }
  }, [state, router]);

  // Escape closes whichever popup is open.
  useEffect(() => {
    if (mode === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode("view")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
        >
          View details
        </button>
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
        >
          Edit
        </button>
      </div>

      {mode === "view" && (
        <Modal title="Lead details" onClose={() => setMode("closed")}>
          <div className="p-5">
            <ReadOnly lead={lead} onEdit={() => setMode("edit")} />
          </div>
        </Modal>
      )}

      {mode === "edit" && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-[6vh]"
          onClick={() => setMode("closed")}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                <span className="text-muted">Edit lead</span>
              </div>
              <button
                type="button"
                onClick={() => setMode("closed")}
                className="text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <form action={action} className="space-y-4 p-5">
              <input type="hidden" name="leadId" value={lead.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="le-name">Contact name</label>
                  <input id="le-name" name="name" required defaultValue={lead.name} className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="le-company">Company</label>
                  <input id="le-company" name="company" defaultValue={lead.company ?? ""} className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="le-email">Email</label>
                  <input id="le-email" name="email" type="email" defaultValue={lead.email ?? ""} className="input text-sm" />
                </div>
                <div>
                  <label className="label" htmlFor="le-phone">Phone</label>
                  <input id="le-phone" name="phone" defaultValue={lead.phone ?? ""} className="input text-sm" />
                </div>
                <SelectOrOther
                  name="purpose"
                  label="Purpose — what they want built"
                  options={LEAD_PURPOSES}
                  defaultValue={lead.purpose}
                />
                <div>
                  <label className="label" htmlFor="le-value">Estimated value (₹)</label>
                  <input
                    id="le-value"
                    name="estimatedValue"
                    inputMode="numeric"
                    defaultValue={lead.estimatedValue ?? ""}
                    className="input text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <SelectOrOther
                    name="source"
                    label="Source"
                    options={LEAD_SOURCES}
                    defaultValue={lead.source}
                  />
                </div>
              </div>

              <fieldset className="space-y-3 rounded-md border border-border p-3">
                <legend className="px-1 text-[11px] uppercase tracking-wide text-muted">Address</legend>
                <div>
                  <label className="label" htmlFor="le-address">Street / Area</label>
                  <textarea
                    id="le-address"
                    name="address"
                    rows={2}
                    defaultValue={lead.address ?? ""}
                    placeholder="Flat / building, street, area / locality"
                    className="input text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* A value already stored that isn't in the list — anything
                      the CSV import brought in — selects Other and appears in
                      the text box, so editing a lead never silently loses it. */}
                  <SelectOrOther
                    name="city"
                    label="City"
                    options={LEAD_CITIES}
                    defaultValue={lead.city}
                  />
                  <SelectOrOther
                    name="state"
                    label="State"
                    options={LEAD_STATES}
                    defaultValue={lead.state}
                  />
                  <div>
                    <label className="label" htmlFor="le-pincode">PIN code</label>
                    <input
                      id="le-pincode"
                      name="pincode"
                      inputMode="numeric"
                      defaultValue={lead.pincode ?? ""}
                      className="input text-sm"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="le-country">Country</label>
                    <input id="le-country" name="country" defaultValue={lead.country ?? ""} placeholder="India" className="input text-sm" />
                  </div>
                </div>
              </fieldset>

              <div>
                <label className="label" htmlFor="le-notes">Notes</label>
                <textarea id="le-notes" name="notes" rows={3} defaultValue={lead.notes} className="input text-sm" />
              </div>

              {state?.error && (
                <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {state.error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setMode("closed")}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="btn-primary text-sm">
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** Collapsed read-only view shown until the user clicks Edit. */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-[6vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            <span className="text-muted">{title}</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReadOnly({ lead, onEdit }: { lead: Lead; onEdit: () => void }) {
  // Clean each line: trim and drop stray leading/trailing commas a user may type.
  const tidy = (s: string | null | undefined) =>
    (s ?? "")
      .split("\n")
      .map((l) => l.replace(/^[\s,]+|[\s,]+$/g, ""))
      .filter(Boolean)
      .join("\n");
  const cityLine = [lead.city, lead.state, lead.pincode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const address = [tidy(lead.address), cityLine, (lead.country ?? "").trim()]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          Contact
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accentInk"
        >
          Edit ✎
        </button>
      </div>

      <div className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Contact" value={lead.name} />
          <Field label="Company" value={lead.company} />
          <Field label="Email" value={lead.email} mono />
          <Field label="Phone" value={lead.phone} mono />
        </dl>
      </div>

      <div className="border-t border-border px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Purpose" value={lead.purpose} />
          <Field label="Source" value={lead.source} />
          <Field
            label="Est. value"
            value={lead.estimatedValue != null ? `₹${lead.estimatedValue.toLocaleString("en-IN")}` : null}
            accent
          />
        </dl>
      </div>

      {address && (
        <div className="border-t border-border px-5 py-4">
          <Field label="Address" value={address} />
        </div>
      )}
      {lead.notes && (
        <div className="border-t border-border px-5 py-4">
          <Field label="Notes" value={lead.notes} />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd
        className={`mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${
          mono ? "font-mono text-[13px]" : ""
        } ${accent ? "text-accentInk" : value ? "text-text" : "text-muted"}`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
