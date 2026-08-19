import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { leads } from "./db/schema";
import { listPipelines, canWorkPipeline } from "./pipelines";
import type { Role } from "./roles-shared";

/**
 * Who may act on a lead.
 *
 * Each role works its own pipeline, so acting on a lead — changing its stage,
 * assigning it, transferring it, editing its details, logging against it —
 * requires that the lead currently sits in a pipeline your roles own. Admins
 * work every pipeline.
 *
 * Viewing is deliberately not restricted here: a telecaller who handed a lead
 * over can still open it and read where it got to, they just can't change it.
 *
 * Enforced in the server actions rather than only in the UI, because every
 * action takes its lead id from the form body — a hidden button is not a
 * control.
 */

export class AccessError extends Error {}

/** True when these roles may act on this lead in its current pipeline. */
export async function canWorkLead(
  leadId: string,
  orgId: string,
  roles: Role[],
): Promise<boolean> {
  if (roles.includes("admin")) return true;

  const rows = await db
    .select({ pipelineId: leads.pipelineId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (rows.length === 0) return false;

  const pipelineId = rows[0].pipelineId;
  // A lead with no pipeline yet is unclaimed — anyone on the CRM may pick it up.
  if (!pipelineId) return true;

  const all = await listPipelines(orgId);
  const pipeline = all.find((p) => p.id === pipelineId);
  if (!pipeline) return true;
  return canWorkPipeline(pipeline, roles);
}

/** Throws unless these roles may act on the lead. */
export async function assertCanWorkLead(
  leadId: string,
  orgId: string,
  roles: Role[],
): Promise<void> {
  if (!(await canWorkLead(leadId, orgId, roles))) {
    throw new AccessError(
      "This lead is in another team's pipeline — you can view it, but not change it.",
    );
  }
}
