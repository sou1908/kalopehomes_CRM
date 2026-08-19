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
      className="flex w-full items-center gap-2.5"
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
              className={`h-[3px] min-w-5 flex-1 rounded-full ${
                // `border` is very pale on the light theme, so the untravelled
                // rule uses muted — it has to read as a line, not a smudge.
                reached > i - 1 ? "" : "border-t-2 border-dotted border-muted/40"
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

          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="relative flex h-[15px] w-[15px] items-center justify-center">
              {isCurrent && (
                <span
                  aria-hidden
                  className="journey-pulse absolute h-[15px] w-[15px] rounded-full"
                  style={{ backgroundColor: pipeline.color }}
                />
              )}
              <span
                className="relative flex h-[15px] w-[15px] items-center justify-center rounded-full text-[8px] font-bold leading-none"
                // Pipeline colours are chosen by the user and several of them
                // sit under 3:1 against the light background — Site Visit's
                // amber is 2.34. A hairline outline defines the dot's edge
                // whatever fill it carries, rather than overriding their colour.
                style={
                  done
                    ? {
                        backgroundColor: pipeline.color,
                        color: "#0a0a0b",
                        boxShadow: "0 0 0 1px rgb(var(--c-muted) / 0.45)",
                      }
                    : isCurrent
                      ? {
                          backgroundColor: "rgb(var(--c-bg))",
                          boxShadow: `inset 0 0 0 3px ${pipeline.color}, 0 0 0 1px rgb(var(--c-muted) / 0.45)`,
                        }
                      : {
                          backgroundColor: "rgb(var(--c-bg))",
                          boxShadow: "inset 0 0 0 2px rgb(var(--c-muted) / 0.5)",
                        }
                }
              >
                {done ? "✓" : ""}
              </span>
            </span>

            <span
              className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
                isCurrent
                  ? "font-semibold text-text"
                  : done
                    ? "font-medium text-text/75"
                    : "text-muted"
              }`}
            >
              {pipeline.name}
            </span>

            {/* Spelled out on the live one — the dot alone doesn't say which
                of "finished" and "in progress" it means at this size. */}
            {isCurrent && (
              <span
                className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]"
                style={{
                  backgroundColor: `${pipeline.color}26`,
                  color: pipeline.color,
                }}
              >
                Here now
              </span>
            )}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
