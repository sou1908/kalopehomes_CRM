"use client";

import {
  journeyFormFor,
  type JourneyField,
  type JourneyStep,
} from "@/lib/leads-shared";
import { saveJourneyStepAction } from "../actions";

/** The journey form for ONE desk on ONE lead — fill fields, Save or Mark done. */
export function DeskStepForm({
  leadId,
  deskId,
  deskName,
  step,
}: {
  leadId: string;
  deskId: string;
  deskName: string;
  step?: JourneyStep;
}) {
  const fields = journeyFormFor(deskName);
  const done = step?.done ?? false;
  return (
    <form
      action={saveJourneyStepAction}
      className="space-y-2 rounded-lg border border-border bg-panel/40 p-3"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="deskId" value={deskId} />
      <input type="hidden" name="fieldKeys" value={fields.map((f) => f.key).join(",")} />
      {fields.map((f) => (
        <Field key={f.key} field={f} value={step?.fields?.[f.key] ?? ""} />
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" name="intent" value="save" className="btn-secondary text-xs">
          Save
        </button>
        <button type="submit" name="intent" value="complete" className="btn-primary text-xs">
          {done ? "Re-confirm done" : "Mark done →"}
        </button>
      </div>
    </form>
  );
}

export function Field({ field, value }: { field: JourneyField; value: string }) {
  const id = `f_${field.key}`;
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
        {field.label}
      </span>
      {field.type === "text" ? (
        <textarea name={id} defaultValue={value} rows={2} className="input text-sm" />
      ) : field.type === "date" ? (
        <input type="date" name={id} defaultValue={value} className="input text-sm" />
      ) : field.type === "yesno" ? (
        <select name={id} defaultValue={value} className="input text-sm">
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <select name={id} defaultValue={value} className="input text-sm">
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
