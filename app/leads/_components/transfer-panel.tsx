"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PipelineInfo } from "@/lib/leads-shared";
import { transferLeadAction, escalateLeadAction } from "../actions";

type Member = { id: string; name: string };

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

  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="leadId" value={leadId} />
        <div>
          <label className="label">To pipeline</label>
          <select name="pipelineId" defaultValue={nextPipeline?.id ?? ""} className="input text-sm">
            {pipelines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Hand to</label>
          <select name="userId" defaultValue="" required className="input text-sm">
            <option value="" disabled>
              Choose a person…
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full text-xs">
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
