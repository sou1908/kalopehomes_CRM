"use client";

import { useState } from "react";
import { initials, colorFromName } from "@/lib/avatar";
import {
  addLeadAssigneeAction,
  removeLeadAssigneeAction,
  setPrimaryAssigneeAction,
} from "../actions";

export type Assignee = { userId: string; name: string; isPrimary: boolean };
type Member = { id: string; name: string };

/** Manage the people working a lead — add/remove + mark a primary. */
export function AssigneesEditor({
  leadId,
  assignees,
  members,
}: {
  leadId: string;
  assignees: Assignee[];
  members: Member[];
}) {
  const [picking, setPicking] = useState(false);
  const assignedIds = new Set(assignees.map((a) => a.userId));
  const available = members.filter((m) => !assignedIds.has(m.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {assignees.length === 0 && (
          <span className="text-xs text-muted">No one assigned yet.</span>
        )}
        {assignees.map((a) => (
          <span
            key={a.userId}
            className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-panel py-0.5 pl-1 pr-2 text-xs"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: colorFromName(a.userId) }}
            >
              {initials(a.name)}
            </span>
            <span className="font-medium">{a.name}</span>
            {a.isPrimary ? (
              <span className="rounded-full bg-accent/20 px-1.5 text-[9px] uppercase tracking-wide text-accentInk">
                primary
              </span>
            ) : (
              <form action={setPrimaryAssigneeAction} className="inline">
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="userId" value={a.userId} />
                <button
                  type="submit"
                  className="text-[10px] text-muted hover:text-accentInk"
                  title="Make primary"
                >
                  ★
                </button>
              </form>
            )}
            <form action={removeLeadAssigneeAction} className="inline">
              <input type="hidden" name="leadId" value={leadId} />
              <input type="hidden" name="userId" value={a.userId} />
              <button
                type="submit"
                className="text-muted hover:text-danger"
                title="Remove"
              >
                ✕
              </button>
            </form>
          </span>
        ))}
      </div>

      {picking ? (
        <form
          action={addLeadAssigneeAction}
          className="flex items-center gap-2"
          onSubmit={() => setPicking(false)}
        >
          <input type="hidden" name="leadId" value={leadId} />
          <select
            name="userId"
            defaultValue=""
            required
            className="input text-sm"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="" disabled>
              Choose a member…
            </option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="text-xs text-muted hover:text-text"
          >
            Cancel
          </button>
        </form>
      ) : (
        available.length > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-accent/50 hover:text-text"
          >
            ＋ Add person
          </button>
        )
      )}
    </div>
  );
}
