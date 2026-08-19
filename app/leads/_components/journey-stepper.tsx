"use client";

import { useState } from "react";
import {
  journeyFormFor,
  type PipelineInfo,
  type JourneyData,
  type JourneyField,
} from "@/lib/leads-shared";
import { PipelineStepForm } from "./pipeline-step-form";

/**
 * The lead's run through the pipelines, as a horizontal track: one node per
 * pipeline, the part already travelled drawn solid, the rest left dotted.
 *
 * Every node is clickable, so anyone working the lead can read what an earlier
 * team recorded — a site agent heading out needs the telecaller's notes. What
 * stays role-scoped is EDITING: you only ever get the form for a pipeline your
 * roles work, and only while the lead is actually in it.
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
  /** Pipelines this viewer's roles let them work — controls editing only. */
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      done: (step?.done ?? false) || left != null,
      isCurrent: pipeline.id === currentPipelineId,
      mine: workablePipelineIds.includes(pipeline.id),
      index: i,
    };
  });

  // Default to whichever step is live; clicking a node overrides it.
  const shown =
    state.find((s) => s.pipeline.id === selectedId) ??
    state.find((s) => s.isCurrent) ??
    state[state.length - 1];

  const lastDone = state.reduce((acc, s) => (s.done ? s.index : acc), -1);
  const reached = currentIndex >= 0 ? currentIndex : lastDone;
  const progress =
    pipelines.length > 1 ? (Math.max(reached, 0) / (pipelines.length - 1)) * 100 : 0;

  return (
    <div>
      {/* ── The track ── */}
      <div className="relative px-2 pt-1">
        <div
          aria-hidden
          className="absolute left-0 right-0 top-[9px] mx-[12%] border-t-2 border-dotted border-border"
        />
        <div
          aria-hidden
          className="absolute left-0 top-[9px] mx-[12%] border-t-2 border-accent/60 transition-[width] duration-500"
          style={{ width: `calc(${progress}% - 0px)`, maxWidth: "76%" }}
        />

        <ol className="relative flex items-start justify-between">
          {state.map(({ pipeline, step, left, done, isCurrent }) => {
            const isShown = pipeline.id === shown.pipeline.id;
            return (
              <li key={pipeline.id} className="flex flex-1 flex-col items-center px-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(pipeline.id)}
                  aria-current={isShown ? "step" : undefined}
                  title={`Show the ${pipeline.name} step`}
                  className="group flex w-full flex-col items-center rounded-lg px-1 py-1 text-center transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span
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
                      isShown
                        ? "text-text underline decoration-accent/60 underline-offset-[6px]"
                        : isCurrent || done
                          ? "text-text"
                          : "text-muted group-hover:text-text"
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
                              new Date((step?.at ?? left?.at)!).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short" },
                              )}
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
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── The selected step ── */}
      <div className="mt-6 border-t border-border pt-5">
        <StepPanel
          leadId={leadId}
          shown={shown}
          nextPipelineName={nextPipelineName}
        />
      </div>
    </div>
  );
}

function StepPanel({
  leadId,
  shown,
  nextPipelineName,
}: {
  leadId: string;
  shown: {
    pipeline: PipelineInfo;
    step?: JourneyData[string];
    done: boolean;
    isCurrent: boolean;
    mine: boolean;
  };
  nextPipelineName?: string | null;
}) {
  const { pipeline, step, done, isCurrent, mine } = shown;
  const fields = journeyFormFor(pipeline.name);
  const recorded = step?.fields ?? {};
  const hasAnswers = fields.some((f) => (recorded[f.key] ?? "").trim() !== "");

  // Yours, and live — the editable form.
  if (isCurrent && mine) {
    return (
      <div>
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

  // Anything else — read what was recorded, without being able to change it.
  return (
    <div>
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        {pipeline.name}
        {isCurrent && !mine ? " · being worked now" : done ? " · recorded" : ""}
      </p>

      {hasAnswers ? (
        <Summary fields={fields} values={recorded} />
      ) : (
        <p className="text-xs text-muted">
          {isCurrent
            ? `The ${pipeline.name} team is working this now — nothing recorded yet.`
            : done
              ? "Moved on without the step being filled in."
              : `Not reached yet — this starts once the lead gets to ${pipeline.name}.`}
        </p>
      )}
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
