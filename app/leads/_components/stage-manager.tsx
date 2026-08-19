"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadStageAction,
  updateLeadStageAction,
  deleteLeadStageAction,
  moveLeadStageOrderAction,
} from "../actions";
import {
  STAGE_COLOR_PALETTE,
  stageProbability,
  type LeadStageInfo,
} from "@/lib/leads-shared";

export type StageRowData = LeadStageInfo & { count: number };

export function StageManager({ stages }: { stages: StageRowData[] }) {
  const openStages = stages.filter((s) => s.kind === "open");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Add a stage</h2>
        <AddStageForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Your stages <span className="ml-1 text-muted">({stages.length})</span>
        </h2>
        <div className="space-y-2">
          {stages.map((stage) => (
            <StageRow
              key={stage.id}
              stage={stage}
              // Reorder only shuffles 'open' stages amongst themselves.
              isFirstOpen={stage.kind === "open" && openStages[0]?.id === stage.id}
              isLastOpen={
                stage.kind === "open" &&
                openStages[openStages.length - 1]?.id === stage.id
              }
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          New stages are added to your pipeline before <b>Won</b>. The <b>Won</b>{" "}
          and <b>Lost</b> stages are built in — you can rename or recolor them, but
          they can’t be removed because conversions depend on them.
        </p>
      </section>
    </div>
  );
}

function AddStageForm() {
  const [state, action, pending] = useActionState(createLeadStageAction, undefined);
  const [color, setColor] = useState(STAGE_COLOR_PALETTE[0]);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      formRef.current?.reset();
      setColor(STAGE_COLOR_PALETTE[0]);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="card space-y-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="new-stage-name">Stage name</label>
          <input
            id="new-stage-name"
            name="name"
            required
            placeholder="e.g. Proposal Sent"
            className="input text-sm"
          />
        </div>
        <div className="w-28">
          <label className="label" htmlFor="new-stage-prob">Win %</label>
          <input
            id="new-stage-prob"
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={50}
            className="input text-sm"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Adding…" : "Add stage"}
        </button>
      </div>
      <ColorSwatches value={color} onChange={setColor} />
      {state?.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}
    </form>
  );
}

function StageRow({
  stage,
  isFirstOpen,
  isLastOpen,
}: {
  stage: StageRowData;
  isFirstOpen: boolean;
  isLastOpen: boolean;
}) {
  const [color, setColor] = useState(stage.color);
  const terminal = stage.kind !== "open";

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base" style={{ color: stage.color }}>
          ●
        </span>
        <span className="text-sm font-medium">{stage.name}</span>
        {terminal && (
          <span className="rounded-full bg-panel px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {stage.kind}
          </span>
        )}
        <span className="text-xs text-muted">{stage.count} leads</span>
        <span className="text-[11px] text-muted">· {stageProbability(stage)}% win</span>

        <div className="ml-auto flex items-center gap-1">
          {stage.kind === "open" && (
            <>
              <ReorderButton stageId={stage.id} direction="up" disabled={isFirstOpen} />
              <ReorderButton stageId={stage.id} direction="down" disabled={isLastOpen} />
            </>
          )}
        </div>
      </div>

      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-text">
          <span className="group-open:hidden">Edit ›</span>
          <span className="hidden group-open:inline">Close ▾</span>
        </summary>

        <form action={updateLeadStageAction} className="mt-3 space-y-3">
          <input type="hidden" name="stageId" value={stage.id} />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Name</label>
              <input
                name="name"
                required
                defaultValue={stage.name}
                className="input text-sm"
              />
            </div>
            <div className="w-28">
              <label className="label">Win %</label>
              <input
                name="probability"
                type="number"
                min={0}
                max={100}
                defaultValue={stageProbability(stage)}
                className="input text-sm"
              />
            </div>
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          <button type="submit" className="btn-primary text-xs">
            Save
          </button>
        </form>

        {!terminal && (
          <div className="mt-3 border-t border-border pt-3">
            <DeleteStageButton stageId={stage.id} count={stage.count} />
          </div>
        )}
      </details>
    </div>
  );
}

function ReorderButton({
  stageId,
  direction,
  disabled,
}: {
  stageId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveLeadStageOrderAction}>
      <input type="hidden" name="stageId" value={stageId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        title={direction === "up" ? "Move earlier" : "Move later"}
        className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        {direction === "up" ? "←" : "→"}
      </button>
    </form>
  );
}

function DeleteStageButton({ stageId, count }: { stageId: string; count: number }) {
  const [state, action, pending] = useActionState(deleteLeadStageAction, undefined);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="stageId" value={stageId} />
      <button
        type="submit"
        disabled={pending || count > 0}
        title={count > 0 ? "Move its leads to another stage first" : "Delete stage"}
        className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete stage"}
      </button>
      {count > 0 && (
        <span className="ml-2 text-[11px] text-muted">
          Move its {count} lead{count === 1 ? "" : "s"} first.
        </span>
      )}
      {state?.error && (
        <div className="mt-2 text-[11px] text-danger">{state.error}</div>
      )}
    </form>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div>
      <label className="label">Color</label>
      <input type="hidden" name="color" value={value} />
      <div className="mt-1 flex flex-wrap gap-2">
        {STAGE_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Use color ${c}`}
            className={`h-6 w-6 rounded-full border-2 transition ${
              value === c ? "border-text" : "border-transparent"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
