import type { DeskInfo } from "@/lib/leads-shared";

/**
 * Where a lead sits in the handling sequence (Telecalling → Site Visit →
 * Manager), as one segment per desk: passed desks are tinted, the current desk
 * is solid, desks still ahead are left as empty rule.
 *
 * The board used to show the desk as a name-only pill, which says where a lead
 * is but not how far along it is. The desks are a genuine ordered track, so
 * position is the more useful fact — and it's the same reading at a glance
 * across a whole column.
 */
export function DeskMeter({
  desks,
  currentDeskId,
  showLabel = true,
}: {
  desks: DeskInfo[];
  currentDeskId: string | null;
  showLabel?: boolean;
}) {
  if (desks.length === 0) return null;

  const currentIndex = currentDeskId
    ? desks.findIndex((d) => d.id === currentDeskId)
    : -1;
  const current = currentIndex >= 0 ? desks[currentIndex] : null;

  return (
    <div>
      <div
        className="flex items-center gap-[3px]"
        role="img"
        aria-label={
          current
            ? `Desk ${currentIndex + 1} of ${desks.length}: ${current.name}`
            : "Not on a desk yet"
        }
      >
        {desks.map((d, i) => {
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
          {current ? current.name : "Unassigned desk"}
        </div>
      )}
    </div>
  );
}
