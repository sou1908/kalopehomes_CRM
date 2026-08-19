"use client";

import type { PipelineInfo } from "@/lib/leads-shared";
import { setLeadPipelineAction } from "../actions";

/** Inline pipeline changer — submits on change, moving the lead to another pipeline. */
export function PipelineMenu({
  leadId,
  value,
  pipelines,
  className,
}: {
  leadId: string;
  value: string | null;
  pipelines: PipelineInfo[];
  className?: string;
}) {
  return (
    <form action={setLeadPipelineAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        key={value ?? ""}
        name="pipelineId"
        defaultValue={value ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement)?.requestSubmit()}
        className={
          className ??
          "rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-text"
        }
      >
        {pipelines.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </form>
  );
}
