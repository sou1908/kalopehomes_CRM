import Link from "next/link";
import { Icon } from "@/app/_components/icons";

/**
 * Narrows the board to leads added between two dates.
 *
 * A plain GET form, so it needs no client JavaScript and the result is a real
 * URL — which means a filtered view can be bookmarked, shared with a colleague,
 * or reloaded without losing the filter.
 *
 * Either end works alone: "from" with no "to" is everything since that day,
 * "to" with no "from" is everything up to it. That covers "what came in this
 * week" and "what was sitting here before the campaign" without needing a mode.
 *
 * Any other query parameter in play (which pipeline you're on) is carried
 * through as a hidden field, so filtering doesn't throw you back to the default
 * board.
 */
export function DateRangeFilter({
  from,
  to,
  carry = {},
}: {
  from?: string;
  to?: string;
  /** Other search params to preserve, as hidden fields. */
  carry?: Record<string, string>;
}) {
  const active = Boolean(from || to);

  return (
    <form method="get" action="/leads" className="flex items-end gap-1.5">
      {Object.entries(carry).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          Added from
        </span>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="input px-2 py-1 text-xs"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          To
        </span>
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="input px-2 py-1 text-xs"
        />
      </label>

      <button
        type="submit"
        title="Apply date range"
        aria-label="Apply date range"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
      >
        <Icon name="search" size={13} />
      </button>

      {/* Only offered once something is filtered — an always-present Clear
          button reads as though a filter is on when none is. */}
      {active && (
        <Link
          href={
            Object.keys(carry).length > 0
              ? `/leads?${new URLSearchParams(carry).toString()}`
              : "/leads"
          }
          title="Clear date range"
          aria-label="Clear date range"
          className="inline-flex items-center rounded-md border border-border px-2 py-1.5 text-muted transition-colors hover:border-danger/50 hover:text-danger"
        >
          <Icon name="close" size={13} />
        </Link>
      )}
    </form>
  );
}
