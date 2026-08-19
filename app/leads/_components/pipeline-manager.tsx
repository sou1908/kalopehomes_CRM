"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPipelineAction,
  updatePipelineAction,
  deletePipelineAction,
  movePipelineOrderAction,
} from "../actions";
import { STAGE_COLOR_PALETTE, type PipelineInfo } from "@/lib/leads-shared";

export type PipelineRowData = PipelineInfo & { count: number };

export function PipelineManager({ pipelines }: { pipelines: PipelineRowData[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Add a pipeline</h2>
        <AddPipelineForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Your pipelines <span className="ml-1 text-muted">({pipelines.length})</span>
        </h2>
        <div className="space-y-2">
          {pipelines.map((pipeline, i) => (
            <PipelineRow
              key={pipeline.id}
              pipeline={pipeline}
              isFirst={i === 0}
              isLast={i === pipelines.length - 1}
              onlyOne={pipelines.length <= 1}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Pipelines are the team-handoff track a lead moves through (e.g. Telecalling →
          Site Visit → Manager). New leads start on the first pipeline.
        </p>
      </section>
    </div>
  );
}

function AddPipelineForm() {
  const [state, action, pending] = useActionState(createPipelineAction, undefined);
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
          <label className="label" htmlFor="new-pipeline-name">Pipeline name</label>
          <input
            id="new-pipeline-name"
            name="name"
            required
            placeholder="e.g. Closing"
            className="input text-sm"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Adding…" : "Add pipeline"}
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

function PipelineRow({
  pipeline,
  isFirst,
  isLast,
  onlyOne,
}: {
  pipeline: PipelineRowData;
  isFirst: boolean;
  isLast: boolean;
  onlyOne: boolean;
}) {
  const [color, setColor] = useState(pipeline.color);

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base" style={{ color: pipeline.color }}>
          ▣
        </span>
        <span className="text-sm font-medium">{pipeline.name}</span>
        <span className="text-xs text-muted">{pipeline.count} leads</span>
        <div className="ml-auto flex items-center gap-1">
          <ReorderButton pipelineId={pipeline.id} direction="up" disabled={isFirst} />
          <ReorderButton pipelineId={pipeline.id} direction="down" disabled={isLast} />
        </div>
      </div>

      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-text">
          <span className="group-open:hidden">Edit ›</span>
          <span className="hidden group-open:inline">Close ▾</span>
        </summary>

        <form action={updatePipelineAction} className="mt-3 space-y-3">
          <input type="hidden" name="pipelineId" value={pipeline.id} />
          <div>
            <label className="label">Name</label>
            <input name="name" required defaultValue={pipeline.name} className="input text-sm" />
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          <button type="submit" className="btn-primary text-xs">Save</button>
        </form>

        <div className="mt-3 border-t border-border pt-3">
          <DeletePipelineButton pipelineId={pipeline.id} count={pipeline.count} onlyOne={onlyOne} />
        </div>
      </details>
    </div>
  );
}

function ReorderButton({
  pipelineId,
  direction,
  disabled,
}: {
  pipelineId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={movePipelineOrderAction}>
      <input type="hidden" name="pipelineId" value={pipelineId} />
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

function DeletePipelineButton({
  pipelineId,
  count,
  onlyOne,
}: {
  pipelineId: string;
  count: number;
  onlyOne: boolean;
}) {
  const [state, action, pending] = useActionState(deletePipelineAction, undefined);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      router.refresh();
    }
  }, [state, router]);

  const blocked = count > 0 || onlyOne;
  return (
    <form action={action}>
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <button
        type="submit"
        disabled={pending || blocked}
        title={
          onlyOne
            ? "Keep at least one pipeline"
            : count > 0
              ? "Move its leads to another pipeline first"
              : "Delete pipeline"
        }
        className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete pipeline"}
      </button>
      {count > 0 && (
        <span className="ml-2 text-[11px] text-muted">
          Move its {count} lead{count === 1 ? "" : "s"} first.
        </span>
      )}
      {state?.error && <div className="mt-2 text-[11px] text-danger">{state.error}</div>}
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
