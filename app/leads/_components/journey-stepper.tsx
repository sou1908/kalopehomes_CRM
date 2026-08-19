"use client";

import {
  journeyFormFor,
  type PipelineInfo,
  type JourneyData,
  type JourneyField,
} from "@/lib/leads-shared";
import { PipelineStepForm } from "./pipeline-step-form";

/**
 * The lead's run through the pipelines.
 *
 * Each role works only its own step: you get the form for your pipeline, and
 * every other pipeline shows as a status line — done or pending, by whom and
 * when — without its captured answers. Those are filtered out server-side, so
 * they aren't in the page at all rather than merely hidden.
 *
 * Admins see and can edit everything.
 */
export function JourneyStepper({
  leadId,
  pipelines,
  currentPipelineId,
  journey,
  workablePipelineIds,
}: {
  leadId: string;
  pipelines: PipelineInfo[];
  currentPipelineId: string | null;
  journey: JourneyData;
  /** Pipelines this viewer's roles let them work. */
  workablePipelineIds: string[];
}) {
  if (pipelines.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No pipelines configured.</p>;
  }

  return (
    <ol className="space-y-4">
      {pipelines.map((pipeline, i) => {
        const step = journey[pipeline.id];
        const done = step?.done ?? false;
        const isCurrent = pipeline.id === currentPipelineId;
        const mine = workablePipelineIds.includes(pipeline.id);
        const fields = journeyFormFor(pipeline.name);

        return (
          <li key={pipeline.id} className="relative pl-7">
            {/* connector */}
            {i < pipelines.length - 1 && (
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
              <span className="text-xs" style={{ color: pipeline.color }}>
                ▣
              </span>
              <span className="text-sm font-medium">{pipeline.name}</span>
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

            {/* The form shows only on the pipeline the lead is on, and only to
                someone whose role works it. */}
            {isCurrent && mine ? (
              <div className="mt-2">
                <PipelineStepForm
                  leadId={leadId}
                  pipelineId={pipeline.id}
                  pipelineName={pipeline.name}
                  step={step}
                />
              </div>
            ) : done && mine ? (
              <Summary fields={fields} values={step?.fields ?? {}} />
            ) : isCurrent && !mine ? (
              <p className="mt-1.5 text-[11px] text-muted">
                Being worked by the {pipeline.name} team.
              </p>
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

