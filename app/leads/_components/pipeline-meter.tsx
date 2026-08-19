import type { PipelineInfo } from "@/lib/leads-shared";

/**
 * Where a lead sits in the handling sequence (Telecalling → Site Visit →
 * Manager), as one segment per pipeline: passed pipelines are tinted, the current pipeline
 * is solid, pipelines still ahead are left as empty rule.
 *
 * The board used to show the pipeline as a name-only pill, which says where a lead
 * is but not how far along it is. The pipelines are a genuine ordered track, so
 * position is the more useful fact — and it's the same reading at a glance
 * across a whole column.
 */
export function PipelineMeter({
  pipelines,
  currentPipelineId,
  showLabel = true,
}: {
  pipelines: PipelineInfo[];
  currentPipelineId: string | null;
  showLabel?: boolean;
}) {
  if (pipelines.length === 0) return null;

  const currentIndex = currentPipelineId
    ? pipelines.findIndex((d) => d.id === currentPipelineId)
    : -1;
  const current = currentIndex >= 0 ? pipelines[currentIndex] : null;

  return (
    <div>
      <div
        className="flex items-center gap-[3px]"
        role="img"
        aria-label={
          current
            ? `Pipeline ${currentIndex + 1} of ${pipelines.length}: ${current.name}`
            : "Not on a pipeline yet"
        }
      >
        {pipelines.map((d, i) => {
          const passed = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <span
              key={d.id}
              title={d.name}
              className={`h-[3px] flex-1 rounded-full ${
                passed || isCurrent ? "" : "bg-border"
              }`}
              style={
                passed
                  ? { backgroundColor: d.color, opacity: 0.4 }
                  : isCurrent
                    ? { backgroundColor: d.color }
                    : undefined
              }
            />
          );
        })}
      </div>
      {showLabel && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          {current ? current.name : "Unassigned pipeline"}
        </div>
      )}
    </div>
  );
}
