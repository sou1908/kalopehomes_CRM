"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineInfo } from "@/lib/leads-shared";
import { rolesCanWorkPipeline } from "@/lib/roles-shared";
import { transferLeadAction, escalateLeadAction } from "../actions";

type Member = { id: string; name: string; roles: string[] };

/**
 * Step a lead to the next pipeline and hand it to a person there, or escalate
 * straight to the Manager pipeline.
 */
export function TransferPanel({
  leadId,
  currentPipelineId,
  pipelines,
  members,
}: {
  leadId: string;
  currentPipelineId: string | null;
  pipelines: PipelineInfo[];
  members: Member[];
}) {
  const [state, action, pending] = useActionState(transferLeadAction, undefined);
  const router = useRouter();
  const lastHandled = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      router.refresh();
    }
  }, [state, router]);

  // Default the pipeline select to the next pipeline after the current one.
  const idx = pipelines.findIndex((d) => d.id === currentPipelineId);
  const nextPipeline = pipelines[idx + 1] ?? pipelines[idx] ?? pipelines[0];

  // Controlled, because who you can hand the lead to depends on it.
  const [pipelineId, setPipelineId] = useState(nextPipeline?.id ?? "");
  const target = pipelines.find((p) => p.id === pipelineId) ?? null;

  /**
   * Only people who actually work the destination, plus admins.
   *
   * Offering the whole org meant a lead could be handed to someone with no role
   * for that pipeline — it would leave the sender's board and land where nobody
   * was looking for it. The server enforces the same rule; this is so the
   * mistake isn't offered in the first place.
   */
  const eligible = target
    ? members.filter((m) => rolesCanWorkPipeline(target.roles, m.roles))
    : members;

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="leadId" value={leadId} />
        <div>
          <label className="label">To pipeline</label>
          <select
            name="pipelineId"
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="input text-sm"
          >
            {pipelines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tp-note">
            Note for them <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id="tp-note"
            name="note"
            rows={2}
            placeholder="Anything they should know before the visit"
            className="input text-sm"
          />
        </div>
        <div>
          <label className="label">Hand to</label>
          {/* Keyed on the pipeline so changing it clears a stale pick rather
              than leaving someone selected who can't work the new one. */}
          <select
            key={pipelineId}
            name="userId"
            defaultValue=""
            required
            disabled={eligible.length === 0}
            className="input text-sm"
          >
            <option value="" disabled>
              {eligible.length === 0 ? "Nobody works this pipeline" : "Choose a person…"}
            </option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {eligible.length === 0 && target && (
            <p className="mt-1 text-[11px] text-muted">
              No one holds a role for {target.name}. Assign someone that role under
              Members first.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || eligible.length === 0}
          className="btn-primary w-full text-xs"
        >
          {pending ? "Transferring…" : "Transfer"}
        </button>
        {state?.error && <div className="text-[11px] text-danger">{state.error}</div>}
      </form>

      <form action={escalateLeadAction} className="border-t border-border pt-3">
        <input type="hidden" name="leadId" value={leadId} />
        <button
          type="submit"
          className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-text"
          title="Move to the Manager pipeline and notify the Lead Manager"
        >
          ⤴ Escalate to Lead Manager
        </button>
      </form>
    </div>
  );
}
