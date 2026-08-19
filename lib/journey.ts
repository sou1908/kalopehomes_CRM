import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { leads, desks } from "./db/schema";
import { parseJourney } from "./leads-shared";
import { setLeadDesk } from "./desks";
import type { LeadActor } from "./leads";

/**
 * [PROTOTYPE] Save a lead's journey step for one desk. Merges the captured
 * field values; when `complete`, stamps who/when and advances the lead to the
 * next desk (soft — nothing is blocked).
 */
export async function saveJourneyStep(input: {
  leadId: string;
  orgId: string;
  deskId: string;
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
  const prev = journey[input.deskId];
  journey[input.deskId] = {
    done: input.complete ? true : prev?.done ?? false,
    by: input.complete ? input.actor.name : prev?.by ?? null,
    at: input.complete ? Date.now() : prev?.at ?? null,
    fields: { ...(prev?.fields ?? {}), ...input.values },
  };

  await db
    .update(leads)
    .set({ journey: JSON.stringify(journey), updatedAt: new Date() })
    .where(and(eq(leads.id, input.leadId), eq(leads.orgId, input.orgId)));

  // On completion, move the lead to the next desk in order (logs a desk_change).
  if (input.complete) {
    const all = await db
      .select()
      .from(desks)
      .where(eq(desks.orgId, input.orgId))
      .orderBy(asc(desks.position));
    const idx = all.findIndex((d) => d.id === input.deskId);
    const next = all[idx + 1];
    if (next) {
      await setLeadDesk(input.leadId, input.orgId, next.id, input.actor);
    }
  }
}
