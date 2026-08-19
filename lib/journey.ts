import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { leads, pipelines } from "./db/schema";
import { parseJourney } from "./leads-shared";
import { setLeadPipeline } from "./pipelines";
import type { LeadActor } from "./leads";

/**
 * [PROTOTYPE] Save a lead's journey step for one pipeline. Merges the captured
 * field values; when `complete`, stamps who/when and advances the lead to the
 * next pipeline (soft — nothing is blocked).
 */
export async function saveJourneyStep(input: {
  leadId: string;
  orgId: string;
  pipelineId: string;
  values: Record<string, string>;
  complete: boolean;
  actor: LeadActor;
}): Promise<void> {
  const rows = await db
    .select({ journey: leads.journey })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)))
    .limit(1);
  if (rows.length === 0) return;

  const journey = parseJourney(rows[0].journey);
  const prev = journey[input.pipelineId];
  journey[input.pipelineId] = {
    done: input.complete ? true : prev?.done ?? false,
    by: input.complete ? input.actor.name : prev?.by ?? null,
    at: input.complete ? Date.now() : prev?.at ?? null,
    fields: { ...(prev?.fields ?? {}), ...input.values },
  };

  await db
    .update(leads)
    .set({ journey: JSON.stringify(journey), updatedAt: new Date() })
    .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)));

  // On completion, move the lead to the next pipeline in order (logs a pipeline_change).
  if (input.complete) {
    const all = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.orgId, input.orgId))
      .orderBy(asc(pipelines.position));
    const idx = all.findIndex((d) => d.id === input.pipelineId);
    const next = all[idx + 1];
    if (next) {
      await setLeadPipeline(input.leadId, input.orgId, next.id, input.actor);
    }
  }
}
