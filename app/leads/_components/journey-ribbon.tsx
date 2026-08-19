import { Fragment } from "react";
import type { PipelineInfo, JourneyData } from "@/lib/leads-shared";

/**
 * A one-line reading of where the lead has got to, for the page header.
 *
 * The full track lower down is the working surface — clickable, with each
 * step's answers. This is only the glance: which teams are finished, who has it
 * now, what's still ahead. Deliberately not interactive, so it says one thing.
 */
export function JourneyRibbon({
  pipelines,
  currentPipelineId,
  journey,
  passed,
}: {
  pipelines: PipelineInfo[];
  currentPipelineId: string | null;
  journey: JourneyData;
  passed?: Record<string, { by: string | null; at: number }>;
}) {
  if (pipelines.length === 0) return null;

  const state = pipelines.map((pipeline) => ({
    pipeline,
    done: (journey[pipeline.id]?.done ?? false) || passed?.[pipeline.id] != null,
    isCurrent: pipeline.id === currentPipelineId,
  }));
  const currentIndex = state.findIndex((s) => s.isCurrent);
  const lastDone = state.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const reached = currentIndex >= 0 ? currentIndex : lastDone;

  return (
    <div
      className="flex w-full items-center gap-2"
      role="img"
      aria-label={state
        .map(
          (s) =>
            `${s.pipeline.name}: ${s.done ? "done" : s.isCurrent ? "here now" : "not reached"}`,
        )
        .join(", ")}
    >
      {state.map(({ pipeline, done, isCurrent }, i) => (
        <Fragment key={pipeline.id}>
          {i > 0 && (
            <span
              aria-hidden
              className={`h-px min-w-4 flex-1 ${
                reached > i - 1 ? "" : "border-t border-dotted border-border"
              }`}
              style={
                reached > i - 1
                  ? {
                      backgroundImage: `linear-gradient(90deg, ${state[i - 1].pipeline.color}, ${pipeline.color})`,
                    }
                  : undefined
              }
            />
          )}

          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className="relative flex h-3 w-3 items-center justify-center">
              {isCurrent && (
                <span
                  aria-hidden
                  className="journey-pulse absolute h-3 w-3 rounded-full"
                  style={{ backgroundColor: pipeline.color }}
                />
              )}
              <span
                className="relative h-3 w-3 rounded-full"
                style={
                  done
                    ? { backgroundColor: pipeline.color }
                    : isCurrent
                      ? {
                          backgroundColor: "rgb(var(--c-bg))",
                          boxShadow: `inset 0 0 0 2px ${pipeline.color}`,
                        }
                      : {
                          backgroundColor: "rgb(var(--c-bg))",
                          boxShadow: "inset 0 0 0 1.5px rgb(var(--c-border))",
                        }
                }
              />
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                isCurrent ? "text-text" : done ? "text-muted" : "text-muted/60"
              }`}
            >
              {pipeline.name}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
