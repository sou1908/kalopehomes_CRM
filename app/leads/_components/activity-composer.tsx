"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addActivityAction } from "../actions";
import { CALL_OUTCOMES, type JourneyField } from "@/lib/leads-shared";
import { DateTimeField } from "./date-time-field";
import { RowsField } from "./rows-field";
import { SectionsField } from "./sections-field";
import { ChecklistField } from "./checklist-field";

const KINDS: { value: string; label: string }[] = [
  { value: "note", label: "📝 Note" },
  { value: "call", label: "📞 Call" },
  { value: "whatsapp", label: "💬 WhatsApp" },
  { value: "meeting", label: "🤝 Meeting" },
];

/**
 * Logs a note / call / whatsapp / meeting onto the lead's timeline — and
 * captures whatever the lead's current stage needs while it's here.
 *
 * The structured bits sit with the log rather than in a separate form because
 * they're recorded in the same breath: a telecaller who books a visit is
 * writing "they want a visit Saturday" and setting the date in one action, not
 * two. Whatever is filled in is saved against the lead's journey alongside the
 * activity, so the site agent still reads it as structured data.
 */
export function ActivityComposer({
  leadId,
  stageName,
  fields = [],
  values = {},
}: {
  leadId: string;
  /** The stage the lead is in, for the heading above its questions. */
  stageName?: string | null;
  /** What this stage asks — empty for stages that ask nothing. */
  fields?: JourneyField[];
  /** Anything already captured, so the boxes open filled in. */
  values?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(addActivityAction, undefined);
  const [kind, setKind] = useState("note");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      formRef.current?.reset();
      setKind("note");
      router.refresh();
    }
  }, [state, router]);

  const isCall = kind === "call";

  return (
    <form ref={formRef} action={action} className="card space-y-2 p-3">
      <input type="hidden" name="leadId" value={leadId} />
      <input
        type="hidden"
        name="fieldKeys"
        value={fields.map((f) => f.key).join(",")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-md border border-border bg-panel px-2 py-1 text-xs"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>

        {isCall && (
          <select
            name="outcome"
            defaultValue={CALL_OUTCOMES[0]}
            className="rounded-md border border-border bg-panel px-2 py-1 text-xs"
          >
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}

        <span className="text-[11px] text-muted">
          {isCall ? "Call outcome + remark" : "Log an interaction"}
        </span>
      </div>

      <textarea
        name="body"
        rows={2}
        placeholder={
          isCall
            ? "Remark (optional) — e.g. asked to call back after 6pm"
            : "What happened? (e.g. wants a quote by Friday)"
        }
        className="input text-sm"
      />
      {/* The current stage's questions. Hidden entirely for stages that ask
          nothing, so the composer stays a composer. */}
      {fields.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-panel/40 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {stageName ? `${stageName} — record while you're here` : "Record"}
          </p>
          {fields.map((f) => (
            <StageField key={f.key} field={f} value={values[f.key] ?? ""} />
          ))}
        </div>
      )}

      {state?.error && <div className="text-[11px] text-danger">{state.error}</div>}
      <div className="flex items-center justify-between gap-2">
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted"
          title="Private notes are visible only to you — never shared or transferred"
        >
          <input type="checkbox" name="private" value="1" className="accent-accent" />
          🔒 Private (only you)
        </label>
        <button type="submit" disabled={pending} className="btn-primary text-xs">
          {pending ? "Logging…" : "Log activity"}
        </button>
      </div>
    </form>
  );
}

/** One stage question inside the composer. */
function StageField({ field, value }: { field: JourneyField; value: string }) {
  const id = `f_${field.key}`;

  // These carry their own controls and none is a single input, so they can't
  // sit inside a <label> without the click target being wrong.
  const COMPOSITE = ["rows", "sections", "checklist"];
  if (COMPOSITE.includes(field.type)) {
    return (
      <div>
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
          {field.label}
        </span>
        {field.type === "rows" ? (
          <RowsField
            name={id}
            columns={field.columns ?? []}
            defaultValue={value}
            addLabel={`Add ${field.label.toLowerCase()}`}
          />
        ) : field.type === "sections" ? (
          <SectionsField
            name={id}
            columns={field.columns ?? []}
            defaultValue={value}
            suggestions={field.options ?? []}
          />
        ) : (
          <ChecklistField name={id} items={field.options ?? []} defaultValue={value} />
        )}
        {field.hint && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{field.hint}</p>
        )}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted">
        {field.label}
      </span>
      {field.type === "datetime" ? (
        <DateTimeField name={id} defaultValue={value} />
      ) : field.type === "text" ? (
        <textarea name={id} defaultValue={value} rows={2} className="input text-sm" />
      ) : field.type === "date" ? (
        <input type="date" name={id} defaultValue={value} className="input text-sm" />
      ) : field.type === "yesno" ? (
        <select name={id} defaultValue={value} className="input text-sm">
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : (
        <select name={id} defaultValue={value} className="input text-sm">
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
