"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/icons";

/**
 * A funnel button that sits beside a column heading and opens that column's
 * filter — the spreadsheet pattern, where you filter where you're looking
 * rather than in a separate bar above the table.
 *
 * Every filter is a URL parameter, so the server does the filtering and the
 * result is linkable, bookmarkable and survives the back button. The only
 * client-side state is which dropdown is open.
 *
 * Four kinds of column:
 *   text   — match on what's typed (Name, Contact)
 *   choice — pick one from a list, with a search box once the list is long
 *            (Assignees, Pipeline, Stage)
 *   range  — a lower and upper bound (Value)
 *   preset — a fixed set of conditions (Follow-up)
 */

export type FilterOption = {
  value: string;
  label: string;
  color?: string;
  count?: number;
};

type Common = {
  /** Column name, used in the button's accessible label. */
  label: string;
  /** Every current query param, so rebuilt URLs keep the other filters. */
  params: Record<string, string>;
  /** Where the dropdown sits — "end" keeps it on screen for last columns. */
  align?: "start" | "end";
};

type Props = Common &
  (
    | { kind: "text"; param: string; placeholder?: string }
    | { kind: "choice"; param: string; options: FilterOption[]; searchable?: boolean }
    | { kind: "range"; minParam: string; maxParam: string; unit?: string }
    | { kind: "preset"; param: string; options: FilterOption[] }
  );

export function ColumnFilter(props: Props) {
  const { label, params, align = "start" } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({
    // Off-screen until measured, so it can't flash in the wrong place.
    top: -9999,
    left: -9999,
  });

  const active = useMemo(() => {
    if (props.kind === "range")
      return Boolean(params[props.minParam] || params[props.maxParam]);
    return Boolean(params[props.param]);
  }, [params, props]);

  /**
   * Put the panel under its button, in viewport coordinates.
   *
   * Kept on screen at both edges: a filter on the last column would otherwise
   * hang off the right, and one near the bottom would run past the fold. If it
   * won't fit below, it flips above the button.
   */
  useEffect(() => {
    if (!open) return;

    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      if (!b) return;
      const width = 240; // w-60
      const height = panelRef.current?.offsetHeight ?? 320;
      const margin = 8;

      let left = align === "end" ? b.right - width : b.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

      const below = b.bottom + 6;
      const flip = below + height > window.innerHeight - margin && b.top > height;
      const top = flip ? b.top - height - 6 : below;

      setPanelStyle({ top, left, maxHeight: window.innerHeight - top - margin });
    };

    place();
    // The button moves when the table scrolls sideways or the window resizes;
    // `true` catches scrolls on the table's own container, not just the page.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Focus the first field so you can type straight away.
    const t = setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      clearTimeout(t);
    };
  }, [open, align]);

  /** Current URL with some params changed. Empty string or null removes one. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `/leads/all?${s}` : "/leads/all";
  };

  const go = (changes: Record<string, string | null>) => {
    setOpen(false);
    router.push(hrefWith(changes));
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        aria-label={active ? `${label} filter (active)` : `Filter by ${label}`}
        aria-expanded={open}
        title={active ? `${label} — filtered` : `Filter by ${label}`}
        className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
          active
            ? "bg-accent/15 text-accentInk"
            : open
              ? "text-text"
              : "text-muted/60 hover:bg-elevated hover:text-text"
        }`}
      >
        <Icon name="funnel" size={12} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Fixed, not absolute, and placed from the button's real screen
              position.

              The table scrolls sideways inside overflow-x-auto, and CSS turns
              that into overflow-y: auto as well — so an absolutely positioned
              panel gets clipped by the table's own edge and only part of the
              list is reachable. Taking it out of that box is the only reliable
              fix short of a portal. */}
          <div
            ref={panelRef}
            style={panelStyle}
            className="fixed z-50 w-60 overflow-y-auto rounded-lg border border-border bg-panel p-2 text-left shadow-xl"
          >
            {props.kind === "text" && (
              <TextFilter
                inputRef={firstFieldRef}
                placeholder={props.placeholder ?? `Search ${label.toLowerCase()}…`}
                value={params[props.param] ?? ""}
                onApply={(v) => go({ [props.param]: v })}
                onClear={() => go({ [props.param]: null })}
              />
            )}

            {props.kind === "choice" && (
              <ChoiceFilter
                inputRef={firstFieldRef}
                label={label}
                options={props.options}
                selected={params[props.param] ?? null}
                searchable={props.searchable ?? props.options.length > 7}
                query={query}
                setQuery={setQuery}
                hrefFor={(v) => hrefWith({ [props.param]: v })}
                onPick={() => setOpen(false)}
              />
            )}

            {props.kind === "preset" && (
              <ChoiceFilter
                inputRef={firstFieldRef}
                label={label}
                options={props.options}
                selected={params[props.param] ?? null}
                searchable={false}
                query=""
                setQuery={() => {}}
                hrefFor={(v) => hrefWith({ [props.param]: v })}
                onPick={() => setOpen(false)}
              />
            )}

            {props.kind === "range" && (
              <RangeFilter
                inputRef={firstFieldRef}
                unit={props.unit}
                min={params[props.minParam] ?? ""}
                max={params[props.maxParam] ?? ""}
                onApply={(min, max) =>
                  go({ [props.minParam]: min, [props.maxParam]: max })
                }
                onClear={() => go({ [props.minParam]: null, [props.maxParam]: null })}
              />
            )}
          </div>
        </>
      )}
    </span>
  );
}

function TextFilter({
  inputRef,
  placeholder,
  value,
  onApply,
  onClear,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  value: string;
  onApply: (v: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted">
          <Icon name="search" size={13} />
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply(draft.trim());
            }
          }}
          placeholder={placeholder}
          className="input py-1.5 pl-7 text-sm"
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onApply(draft.trim())}
          className="btn-primary flex-1 px-2 py-1 text-xs"
        >
          Apply
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ChoiceFilter({
  inputRef,
  label,
  options,
  selected,
  searchable,
  query,
  setQuery,
  hrefFor,
  onPick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  label: string;
  options: FilterOption[];
  selected: string | null;
  searchable: boolean;
  query: string;
  setQuery: (v: string) => void;
  hrefFor: (value: string | null) => string;
  onPick: () => void;
}) {
  const shown = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div>
      {searchable && (
        <div className="relative mb-1.5">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={13} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="input py-1.5 pl-7 text-sm"
          />
        </div>
      )}

      <div className="max-h-60 space-y-0.5 overflow-y-auto">
        <Link
          href={hrefFor(null)}
          onClick={onPick}
          className={`flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors ${
            !selected
              ? "bg-elevated text-text"
              : "text-muted hover:bg-elevated hover:text-text"
          }`}
        >
          <span className="truncate">All</span>
          {!selected && (
            <Icon name="check" size={13} className="ml-auto text-accentInk" />
          )}
        </Link>

        {shown.map((o) => {
          const on = selected === o.value;
          return (
            <Link
              key={o.value}
              href={hrefFor(on ? null : o.value)}
              onClick={onPick}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors ${
                on ? "bg-elevated text-text" : "text-muted hover:bg-elevated hover:text-text"
              }`}
            >
              {o.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: o.color }}
                />
              )}
              <span className="truncate">{o.label}</span>
              {on ? (
                <Icon name="check" size={13} className="ml-auto shrink-0 text-accentInk" />
              ) : (
                o.count != null && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted">
                    {o.count}
                  </span>
                )
              )}
            </Link>
          );
        })}

        {shown.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted">
            Nothing matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}

function RangeFilter({
  inputRef,
  unit,
  min,
  max,
  onApply,
  onClear,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  unit?: string;
  min: string;
  max: string;
  onApply: (min: string, max: string) => void;
  onClear: () => void;
}) {
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  const submit = () => onApply(lo.trim(), hi.trim());
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={lo}
          onChange={(e) => setLo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          inputMode="numeric"
          placeholder={unit ? `Min ${unit}` : "Min"}
          className="input py-1.5 text-sm"
        />
        <span className="text-xs text-muted">to</span>
        <input
          value={hi}
          onChange={(e) => setHi(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          inputMode="numeric"
          placeholder={unit ? `Max ${unit}` : "Max"}
          className="input py-1.5 text-sm"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        Leads with no value are hidden while this is set.
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={submit}
          className="btn-primary flex-1 px-2 py-1 text-xs"
        >
          Apply
        </button>
        {(min || max) && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
