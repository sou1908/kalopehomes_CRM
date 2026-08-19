"use client";

import {
  journeyFormFor,
  type PipelineInfo,
  type JourneyData,
  type JourneyField,
} from "@/lib/leads-shared";
import { PipelineStepForm } from "./pipeline-step-form";

/**
 * The lead's run through the pipelines, as a horizontal track: one node per
 * pipeline, the completed part of the line drawn solid, the rest left dotted.
 * The step being worked is the lit node, and its content sits below the track.
 *
 * Each role works only its own step: you get the form for your pipeline, and
 * every other pipeline shows as a node with its state — done or pending, by
 * whom and when — without its captured answers. Those are filtered out
 * server-side, so they aren't in the page at all rather than merely hidden.
 *
 * Admins see and can edit everything.
 */
export function JourneyStepper({
  leadId,
  pipelines,
  currentPipelineId,
  journey,
  workablePipelineIds,
  nextPipelineName,
  passed,
}: {
  leadId: string;
  pipelines: PipelineInfo[];
  currentPipelineId: string | null;
  journey: JourneyData;
  /** Pipelines this viewer's roles let them work. */
  workablePipelineIds: string[];
  /** The pipeline the current step hands on to, if any. */
  nextPipelineName?: string | null;
  /**
   * Pipelines this lead has finished and left, by id. A lead can be transferred
   * on without its step ever being marked done, and showing that pipeline as
   * "Pending" when the lead is already past it is simply wrong.
   */
  passed?: Record<string, { by: string | null; at: number }>;
}) {
  if (pipelines.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">No pipelines configured.</p>;
  }

  const currentIndex = pipelines.findIndex((p) => p.id === currentPipelineId);
  const state = pipelines.map((pipeline, i) => {
    const step = journey[pipeline.id];
    const left = passed?.[pipeline.id] ?? null;
    return {
      pipeline,
      step,
      left,
      // Either the step was marked done, or the lead has moved past it.
      done: (step?.done ?? false) || left != null,
      isCurrent: pipeline.id === currentPipelineId,
      mine: workablePipelineIds.includes(pipeline.id),
      index: i,
    };
  });

  // How far along the track to draw the solid line: to the node being worked,
  // or to the last completed one when the lead has left the pipelines entirely.
  const lastDone = state.reduce((acc, s) => (s.done ? s.index : acc), -1);
  const reached = currentIndex >= 0 ? currentIndex : lastDone;
  const progress =
    pipelines.length > 1 ? (Math.max(reached, 0) / (pipelines.length - 1)) * 100 : 0;

  return (
    <div>
      {/* ── The track ── */}
      <div className="relative px-2 pt-1">
        {/* The full run, dotted — what's still ahead. */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-[9px] mx-[12%] border-t-2 border-dotted border-border"
        />
        {/* The part already travelled, drawn over it. */}
        <div
          aria-hidden
          className="absolute left-0 top-[9px] mx-[12%] border-t-2 border-accent/60 transition-[width] duration-500"
          style={{ width: `calc(${progress}% - 0px)`, maxWidth: "76%" }}
        />

        <ol className="relative flex items-start justify-between">
          {state.map(({ pipeline, step, left, done, isCurrent }) => (
            <li
              key={pipeline.id}
              className="flex flex-1 flex-col items-center px-1 text-center"
            >
              <span
                title={pipeline.name}
                className={`relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 bg-panel text-[9px] transition-transform ${
                  done
                    ? "border-transparent text-black"
                    : isCurrent
                      ? "scale-110 border-transparent"
                      : "border-border text-muted"
                }`}
                style={
                  done || isCurrent
                    ? {
                        backgroundColor: pipeline.color,
                        boxShadow: isCurrent
                          ? `0 0 0 4px ${pipeline.color}33, 0 0 12px ${pipeline.color}66`
                          : undefined,
                      }
                    : undefined
                }
              >
                {done ? "✓" : ""}
              </span>

              <span
                className={`mt-3 font-display text-[15px] leading-tight tracking-[-0.01em] ${
                  isCurrent || done ? "text-text" : "text-muted"
                }`}
              >
                {pipeline.name}
              </span>

              <span className="mt-1 font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em]">
                {done ? (
                  <span className="text-success">
                    {step?.done ? "Done" : "Handed on"}
                    {step?.at ?? left?.at ? (
                      <span suppressHydrationWarning>
                        {" · " +
                          new Date((step?.at ?? left?.at)!).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                      </span>
                    ) : null}
                  </span>
                ) : isCurrent ? (
                  <span className="text-accentInk">In progress</span>
                ) : (
                  <span className="text-muted/70">Pending</span>
                )}
              </span>

              {done && (step?.by ?? left?.by) && (
                <span className="mt-0.5 text-[10px] text-muted">
                  {step?.by ?? left?.by}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* ── The step being worked ── */}
      <div className="mt-6 border-t border-border pt-5">
        {state.map(({ pipeline, step, done, isCurrent, mine }) => {
          const fields = journeyFormFor(pipeline.name);

          if (isCurrent && mine) {
            return (
              <div key={pipeline.id}>
                {done && nextPipelineName && (
                  <div className="mb-3 rounded-md border border-marigold/40 bg-marigold/10 px-3 py-2 text-[11px] leading-relaxed text-marigold">
                    This step is done, but the lead is still with {pipeline.name}. Use{" "}
                    <span className="font-medium">Transfer</span> to send it to{" "}
                    {nextPipelineName} and choose who picks it up.
                  </div>
                )}
                <PipelineStepForm
                  leadId={leadId}
                  pipelineId={pipeline.id}
                  pipelineName={pipeline.name}
                  step={step}
                />
              </div>
            );
          }

          if (isCurrent && !mine) {
            return (
              <p key={pipeline.id} className="text-xs text-muted">
                Being worked by the {pipeline.name} team.
              </p>
            );
          }

          // Your own finished step — the answers you captured.
          if (done && mine && step?.done) {
            return (
              <div key={pipeline.id}>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                  {pipeline.name} · what you recorded
                </p>
                <Summary fields={fields} values={step?.fields ?? {}} />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
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
    <dl className="space-y-1 rounded-lg border border-border bg-panel/30 p-3 text-xs">
      {filled.map((f) => (
        <div key={f.key} className="flex gap-2">
          <dt className="shrink-0 text-muted">{f.label}:</dt>
          <dd className="min-w-0 break-words text-text">{values[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
