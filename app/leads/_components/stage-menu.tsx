"use client";

import type { LeadStageInfo } from "@/lib/leads-shared";
import { moveLeadStageAction } from "../actions";

/** Inline stage changer — submits on change, moving the lead across columns. */
export function StageMenu({
  leadId,
  value,
  stages,
  className,
}: {
  leadId: string;
  value: string | null;
  stages: LeadStageInfo[];
  className?: string;
}) {
  return (
    <form action={moveLeadStageAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        key={value ?? ""}
        name="stageId"
        defaultValue={value ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement)?.requestSubmit()}
        className={
          className ??
          "rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-text"
        }
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </form>
  );
}
