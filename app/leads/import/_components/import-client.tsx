"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/icons";
import { formatValue } from "@/lib/leads-shared";
import { previewImportAction, commitImportAction } from "../actions";
import type { ImportPreview, ImportResult } from "@/lib/lead-import";

type Phase =
  | { step: "pick" }
  | { step: "review"; preview: ImportPreview }
  | { step: "done"; result: ImportResult };

export function ImportClient({
  assignees = [],
  defaultAssigneeId = null,
}: {
  /** People who work the pipeline imported leads land in. */
  assignees?: Array<{ id: string; name: string }>;
  /** Pre-selected: whoever is importing, when they work that pipeline. */
  defaultAssigneeId?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  // On by default: a lead nobody can ring is not worth a caller's queue.
  const [skipUnreachable, setSkipUnreachable] = useState(true);
  const [assigneeId, setAssigneeId] = useState<string>(defaultAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read that file from your computer.");
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      start(async () => {
        const res = await previewImportAction(text);
        if (res.ok) setPhase({ step: "review", preview: res.preview });
        else setError(res.error);
      });
    };
    reader.readAsText(file);
  };

  const reset = () => {
    setPhase({ step: "pick" });
    setFileName(null);
    setCsvText("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Done ────────────────────────────────────────────────────────────────
  if (phase.step === "done") {
    const r = phase.result;
    return (
      <div className="card mt-6 p-6">
        <h2 className="font-display text-2xl font-medium">
          {r.created > 0
            ? `${r.created} lead${r.created === 1 ? "" : "s"} imported`
            : "Nothing was imported"}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Tally label="Created" value={r.created} tone="text-success" />
          <Tally label="Duplicates skipped" value={r.skippedDuplicates} />
          <Tally label="No phone, skipped" value={r.skippedUnreachable} />
          <Tally label="Rows without a name" value={r.skippedInvalid} />
          <Tally label="Failed" value={r.failures.length} tone="text-danger" />
        </dl>

        {r.failures.length > 0 && (
          <div className="mt-5 rounded-md border border-danger/40 bg-danger/10 p-3">
            <p className="text-xs font-medium text-danger">
              These rows couldn&apos;t be created:
            </p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-danger">
              {r.failures.slice(0, 10).map((f) => (
                <li key={f.line}>
                  Row {f.line} — {f.name || "(no name)"}: {f.reason}
                </li>
              ))}
            </ul>
            {r.failures.length > 10 && (
              <p className="mt-1 text-[11px] text-danger/70">
                …and {r.failures.length - 10} more.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link href="/leads" className="btn-primary text-sm">
            Go to the pipeline
          </Link>
          <button type="button" onClick={reset} className="btn-secondary text-sm">
            Import another file
          </button>
        </div>
      </div>
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────
  if (phase.step === "review") {
    const p = phase.preview;
    const willCreate =
      p.totals.ready -
      // A row can be both a duplicate and unreachable; count it once.
      p.rows.filter(
        (r) =>
          !r.error &&
          ((skipDuplicates && r.duplicateOf != null) ||
            (skipUnreachable && r.unreachable)),
      ).length;

    return (
      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {fileName}
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted transition-colors hover:text-text"
          >
            Choose a different file
          </button>
        </div>

        {p.missingNameColumn ? (
          <div className="rounded-md border border-danger/40 bg-danger/10 p-4">
            <p className="text-sm text-danger">
              No name column found. Every lead needs a name, so nothing can be
              imported from this file. Add a column headed{" "}
              <span className="font-mono">Name</span> and upload it again.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="Rows read" value={p.totals.total} />
            <Figure label="Will import" value={willCreate} tone="text-success" />
            <Figure
              label="Duplicates"
              value={p.totals.duplicates}
              tone={p.totals.duplicates > 0 ? "text-marigold" : undefined}
            />
            <Figure
              label="No phone"
              value={p.totals.unreachable}
              tone={p.totals.unreachable > 0 ? "text-marigold" : undefined}
            />
            <Figure
              label="No name"
              value={p.totals.failed}
              tone={p.totals.failed > 0 ? "text-danger" : undefined}
            />
          </div>
        )}

        {/* What we understood from the file's headings */}
        <div className="card p-4">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Columns
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.matched.map((m) => (
              <span
                key={m.header}
                className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] text-success"
              >
                {m.header}
                <span className="text-success/60">→ {m.field}</span>
              </span>
            ))}
            {p.ignored.map((h) => (
              <span
                key={h}
                title="Not a field the CRM stores — this column is ignored"
                className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted line-through"
              >
                {h}
              </span>
            ))}
          </div>
          {p.ignored.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              Struck-through columns aren&apos;t fields the CRM stores — their data
              is ignored. Put anything you want to keep in a{" "}
              <span className="font-mono">Notes</span> column.
            </p>
          )}
        </div>

        {p.truncated && (
          <p className="rounded-md border border-marigold/40 bg-marigold/10 px-3 py-2 text-xs text-marigold">
            Only the first 2,000 rows are shown and will be imported. Split the
            rest into another file.
          </p>
        )}

        {/* Row-by-row */}
        <div className="card overflow-hidden">
          <div className="no-scrollbar max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-3 py-2 font-normal">Row</th>
                  <th className="px-3 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal">Contact</th>
                  <th className="px-3 py-2 font-normal">Value</th>
                  <th className="px-3 py-2 font-normal">Stage</th>
                  <th className="px-3 py-2 font-normal">Notes on this row</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => {
                  const skipped =
                    r.error != null ||
                    (skipDuplicates && r.duplicateOf != null) ||
                    (skipUnreachable && r.unreachable);
                  return (
                    <tr
                      key={r.line}
                      className={`border-b border-border/60 last:border-0 ${
                        skipped ? "opacity-55" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-muted">
                        {r.line}
                      </td>
                      <td className="px-3 py-2">
                        {r.name || (
                          <span className="text-danger">— missing —</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted">
                        <div className="truncate">{r.email ?? "—"}</div>
                        <div className="font-mono text-[11px]">{r.phone ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums">
                        {formatValue(r.estimatedValue) ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-muted">
                        {r.stageName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5 text-[11px]">
                          {r.error && <div className="text-danger">{r.error}</div>}
                          {r.duplicateOf === "existing" && (
                            <div className="text-marigold">
                              Already in the CRM.
                            </div>
                          )}
                          {r.duplicateOf === "file" && (
                            <div className="text-marigold">
                              Repeated earlier in this file.
                            </div>
                          )}
                          {!r.error && r.unreachable && (
                            <div className="text-marigold">
                              {r.phone
                                ? `"${r.phone}" isn't a full phone number.`
                                : "No phone number — nobody can call this lead."}
                            </div>
                          )}
                          {r.warnings.map((w, i) => (
                            <div key={i} className="text-muted">
                              {w}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-accent"
              />
              Skip the {p.totals.duplicates} duplicate
              {p.totals.duplicates === 1 ? "" : "s"}
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={skipUnreachable}
                onChange={(e) => setSkipUnreachable(e.target.checked)}
                className="accent-accent"
              />
              Skip the {p.totals.unreachable} with no phone
            </label>

            {assignees.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Assign to
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="input w-auto py-1 text-sm"
                >
                  <option value="">No one</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id === defaultAssigneeId ? `${a.name} (me)` : a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={pending || willCreate <= 0 || p.missingNameColumn}
            onClick={() =>
              start(async () => {
                const res = await commitImportAction(
                  csvText,
                  skipDuplicates,
                  assigneeId || null,
                  skipUnreachable,
                );
                if (res.ok) setPhase({ step: "done", result: res.result });
                else setError(res.error);
              })
            }
            className="btn-primary text-sm disabled:opacity-40"
          >
            {pending
              ? "Importing…"
              : willCreate > 0
                ? `Import ${willCreate} lead${willCreate === 1 ? "" : "s"}`
                : "Nothing to import"}
          </button>
        </div>
      </div>
    );
  }

  // ── Pick a file ─────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        className={`rounded-xl border border-dashed p-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted">
          <Icon name="list" size={18} />
        </div>
        <p className="mt-3 text-sm">
          Drop your CSV here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-accentInk underline underline-offset-2"
          >
            choose a file
          </button>
          .
        </p>
        <p className="mt-1 text-xs text-muted">
          Up to 2,000 rows. Nothing is saved until you&apos;ve reviewed it.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
      </div>

      {pending && (
        <p className="mt-3 text-center text-sm text-muted">Reading {fileName}…</p>
      )}
      {error && (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="card px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl tabular-nums ${tone ?? "text-text"}`}>
        {value}
      </div>
    </div>
  );
}

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className={`mt-0.5 font-mono text-lg tabular-nums ${tone ?? "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
