"use client";

import {
  journeyFormFor,
  type DeskInfo,
  type JourneyData,
  type JourneyField,
} from "@/lib/leads-shared";
import { DeskStepForm } from "./desk-step-form";

export function JourneyStepper({
  leadId,
  desks,
  currentDeskId,
  journey,
}: {
  leadId: string;
  desks: DeskInfo[];
  currentDeskId: string | null;
  journey: JourneyData;
}) {
  if (desks.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No desks configured.</p>;
  }

  return (
    <ol className="space-y-4">
      {desks.map((desk, i) => {
        const step = journey[desk.id];
        const done = step?.done ?? false;
        const isCurrent = desk.id === currentDeskId;
        const fields = journeyFormFor(desk.name);

        return (
          <li key={desk.id} className="relative pl-7">
            {/* connector */}
            {i < desks.length - 1 && (
              <span className="absolute left-[10px] top-6 h-[calc(100%+0.5rem)] w-px bg-border" />
            )}
            {/* node */}
            <span
              className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                done
                  ? "border-success bg-success/20 text-success"
                  : isCurrent
                    ? "border-accent bg-accent/20 text-accentInk"
                    : "border-border bg-panel text-muted"
              }`}
            >
              {done ? "✓" : isCurrent ? "●" : "○"}
            </span>

            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: desk.color }}>
                ▣
              </span>
              <span className="text-sm font-medium">{desk.name}</span>
              {done ? (
                <span className="text-[11px] text-success">
                  Done{step?.by ? ` · ${step.by}` : ""}
                  {step?.at ? (
                    <span suppressHydrationWarning>
                      {" · " + new Date(step.at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : null}
                </span>
              ) : isCurrent ? (
                <span className="text-[11px] text-accentInk">In progress</span>
              ) : (
                <span className="text-[11px] text-muted">Pending</span>
              )}
            </div>

            {/* The form only shows on the desk the lead is currently on. */}
            {isCurrent ? (
              <div className="mt-2">
                <DeskStepForm
                  leadId={leadId}
                  deskId={desk.id}
                  deskName={desk.name}
                  step={step}
                />
              </div>
            ) : done ? (
              <Summary fields={fields} values={step?.fields ?? {}} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({
  fields,
  values,
}: {
  fields: JourneyField[];
  values: Record<string, string>;
}) {
  const filled = fields.filter((f) => (values[f.key] ?? "").trim() !== "");
  if (filled.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1 rounded-lg border border-border bg-panel/30 p-3 text-xs">
      {filled.map((f) => (
        <div key={f.key} className="flex gap-2">
          <dt className="shrink-0 text-muted">{f.label}:</dt>
          <dd className="min-w-0 break-words text-text">{values[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

