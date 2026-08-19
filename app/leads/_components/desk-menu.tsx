"use client";

import type { DeskInfo } from "@/lib/leads-shared";
import { setLeadDeskAction } from "../actions";

/** Inline desk changer — submits on change, moving the lead to another desk. */
export function DeskMenu({
  leadId,
  value,
  desks,
  className,
}: {
  leadId: string;
  value: string | null;
  desks: DeskInfo[];
  className?: string;
}) {
  return (
    <form action={setLeadDeskAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        key={value ?? ""}
        name="deskId"
        defaultValue={value ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => (e.currentTarget.form as HTMLFormElement)?.requestSubmit()}
        className={
          className ??
          "rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-text"
        }
      >
        {desks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </form>
  );
}
