"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDeskAction,
  updateDeskAction,
  deleteDeskAction,
  moveDeskOrderAction,
} from "../actions";
import { STAGE_COLOR_PALETTE, type DeskInfo } from "@/lib/leads-shared";

export type DeskRowData = DeskInfo & { count: number };

export function DeskManager({ desks }: { desks: DeskRowData[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium">Add a desk</h2>
        <AddDeskForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Your desks <span className="ml-1 text-muted">({desks.length})</span>
        </h2>
        <div className="space-y-2">
          {desks.map((desk, i) => (
            <DeskRow
              key={desk.id}
              desk={desk}
              isFirst={i === 0}
              isLast={i === desks.length - 1}
              onlyOne={desks.length <= 1}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Desks are the team-handoff track a lead moves through (e.g. Telecalling →
          Site Visit → Manager). New leads start on the first desk.
        </p>
      </section>
    </div>
  );
}

function AddDeskForm() {
  const [state, action, pending] = useActionState(createDeskAction, undefined);
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
          <label className="label" htmlFor="new-desk-name">Desk name</label>
          <input
            id="new-desk-name"
            name="name"
            required
            placeholder="e.g. Closing"
            className="input text-sm"
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending ? "Adding…" : "Add desk"}
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

function DeskRow({
  desk,
  isFirst,
  isLast,
  onlyOne,
}: {
  desk: DeskRowData;
  isFirst: boolean;
  isLast: boolean;
  onlyOne: boolean;
}) {
  const [color, setColor] = useState(desk.color);

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base" style={{ color: desk.color }}>
          ▣
        </span>
        <span className="text-sm font-medium">{desk.name}</span>
        <span className="text-xs text-muted">{desk.count} leads</span>
        <div className="ml-auto flex items-center gap-1">
          <ReorderButton deskId={desk.id} direction="up" disabled={isFirst} />
          <ReorderButton deskId={desk.id} direction="down" disabled={isLast} />
        </div>
      </div>

      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-xs text-muted hover:text-text">
          <span className="group-open:hidden">Edit ›</span>
          <span className="hidden group-open:inline">Close ▾</span>
        </summary>

        <form action={updateDeskAction} className="mt-3 space-y-3">
          <input type="hidden" name="deskId" value={desk.id} />
          <div>
            <label className="label">Name</label>
            <input name="name" required defaultValue={desk.name} className="input text-sm" />
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          <button type="submit" className="btn-primary text-xs">Save</button>
        </form>

        <div className="mt-3 border-t border-border pt-3">
          <DeleteDeskButton deskId={desk.id} count={desk.count} onlyOne={onlyOne} />
        </div>
      </details>
    </div>
  );
}

function ReorderButton({
  deskId,
  direction,
  disabled,
}: {
  deskId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveDeskOrderAction}>
      <input type="hidden" name="deskId" value={deskId} />
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

function DeleteDeskButton({
  deskId,
  count,
  onlyOne,
}: {
  deskId: string;
  count: number;
  onlyOne: boolean;
}) {
  const [state, action, pending] = useActionState(deleteDeskAction, undefined);
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
      <input type="hidden" name="deskId" value={deskId} />
      <button
        type="submit"
        disabled={pending || blocked}
        title={
          onlyOne
            ? "Keep at least one desk"
            : count > 0
              ? "Move its leads to another desk first"
              : "Delete desk"
        }
        className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete desk"}
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
