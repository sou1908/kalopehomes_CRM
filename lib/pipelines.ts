import "server-only";
import { nanoid } from "nanoid";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  pipelines,
  leads,
  leadActivities,
  leadStages,
  leadPipelineHistory,
} from "./db/schema";
import type { Pipeline } from "./db/schema";
import {
  parsePipelineRoles,
  parseJourneyFields,
  type JourneyField,
} from "./leads-shared";

/**
 * A pipeline with its JSON columns already parsed. Everything above this layer
 * works with real arrays — the raw row's `roles`/`fields` strings never escape.
 */
export type PipelineRow = Omit<Pipeline, "roles" | "fields"> & {
  roles: string[];
  fields: JourneyField[];
};

function hydrate(row: Pipeline): PipelineRow {
  return {
    ...row,
    roles: parsePipelineRoles(row.roles),
    fields: parseJourneyFields(row.fields),
  };
}

/** True when these roles may work this pipeline. Admins may work all of them. */
export function canWorkPipeline(
  pipeline: { roles: string[] },
  roles: string[],
): boolean {
  if (roles.includes("admin")) return true;
  return pipeline.roles.some((r) => roles.includes(r));
}

/** Leads that finished a pipeline and have since moved on out of it. */
export async function leadsHandedOnFrom(
  orgId: string,
  pipelineId: string,
): Promise<string[]> {
  const rows = await db
    .select({ leadId: leadPipelineHistory.leadId })
    .from(leadPipelineHistory)
    .where(
      and(
        eq(leadPipelineHistory.orgId, orgId),
        eq(leadPipelineHistory.pipelineId, pipelineId),
      ),
    );
  return rows.map((r) => r.leadId);
}

/** Pipelines this user may work. Admins get all of them. */
export function pipelinesForRoles(
  all: PipelineRow[],
  roles: string[],
): PipelineRow[] {
  if (roles.includes("admin")) return all;
  return all.filter((p) => p.roles.some((r) => roles.includes(r)));
}
import type { LeadActor } from "./leads";

export class PipelineError extends Error {}

const STAGE_COLORS = [
  "#6a89a8",
  "#d99756",
  "#7c9e6d",
  "#b85a3d",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
];

/** The org's handling pipelines, ordered Telecalling → … → Manager. */
export async function listPipelines(orgId: string): Promise<PipelineRow[]> {
  const rows = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.orgId, orgId))
    .orderBy(asc(pipelines.position), asc(pipelines.createdAt));
  return rows.map(hydrate);
}

export async function getPipeline(id: string, orgId: string): Promise<PipelineRow | null> {
  const rows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)))
    .limit(1);
  return rows[0] ? hydrate(rows[0]) : null;
}

/** The first pipeline (entry point — Telecalling) for new/orphaned leads. */
export async function firstPipelineId(orgId: string): Promise<string | null> {
  const rows = await listPipelines(orgId);
  return rows[0]?.id ?? null;
}

export async function createPipeline(input: {
  orgId: string;
  name: string;
  color?: string;
}): Promise<PipelineRow> {
  const name = input.name.trim();
  if (!name) throw new PipelineError("Pipeline name is required.");
  const existing = await listPipelines(input.orgId);
  const lastPos = existing.at(-1)?.position ?? 0;
  const color = input.color || STAGE_COLORS[existing.length % STAGE_COLORS.length];
  const id = nanoid(21);
  await db.insert(pipelines).values({
    id,
    orgId: input.orgId,
    name,
    color,
    position: lastPos + 10,
  });
  return (await getPipeline(id, input.orgId))!;
}

export async function updatePipeline(
  id: string,
  orgId: string,
  patch: { name?: string; color?: string },
): Promise<void> {
  const pipeline = await getPipeline(id, orgId);
  if (!pipeline) throw new PipelineError("Pipeline not found.");
  const set: Partial<typeof pipelines.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new PipelineError("Pipeline name is required.");
    set.name = name;
  }
  if (patch.color) set.color = patch.color;
  if (Object.keys(set).length === 0) return;
  await db.update(pipelines).set(set).where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)));
}

/** Delete a pipeline. Refuses if it still holds leads, or if it's the last pipeline. */
export async function deletePipeline(id: string, orgId: string): Promise<void> {
  const all = await listPipelines(orgId);
  if (all.length <= 1) throw new PipelineError("Keep at least one pipeline.");
  const held = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), eq(leads.pipelineId, id)));
  if (Number(held[0]?.c ?? 0) > 0)
    throw new PipelineError("Move the leads on this pipeline elsewhere before deleting it.");
  await db.delete(pipelines).where(and(eq(pipelines.id, id), eq(pipelines.orgId, orgId)));
}

/** Swap a pipeline's position with its neighbour (reorder left/right). */
export async function movePipeline(
  id: string,
  orgId: string,
  dir: "up" | "down",
): Promise<void> {
  const all = await listPipelines(orgId);
  const idx = all.findIndex((d) => d.id === id);
  if (idx === -1) return;
  const swapWith = dir === "up" ? all[idx - 1] : all[idx + 1];
  if (!swapWith) return;
  const me = all[idx];
  await db.update(pipelines).set({ position: swapWith.position }).where(eq(pipelines.id, me.id));
  await db.update(pipelines).set({ position: me.position }).where(eq(pipelines.id, swapWith.id));
}

/**
 * Move a lead to a handling pipeline. Logs a `pipeline_change` activity (skipped when
 * `silent`, e.g. during a richer transfer that logs its own entry).
 */
export async function setLeadPipeline(
  leadId: string,
  orgId: string,
  pipelineId: string,
  actor: LeadActor,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const pipeline = await getPipeline(pipelineId, orgId);
  if (!pipeline) throw new PipelineError("Invalid pipeline.");
  const before = await db
    .select({ pipelineId: leads.pipelineId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .limit(1);
  if (before.length === 0) throw new PipelineError("Lead not found.");
  if (before[0].pipelineId === pipelineId) return;

  // Leaving a pipeline completes this lead's run through it. Recorded here
  // rather than only on journey-completion, so a transfer or an escalation
  // counts too — otherwise the pipeline it left loses sight of it entirely.
  const leaving = before[0].pipelineId;
  if (leaving) {
    const prior = await db
      .select({ id: leadPipelineHistory.id })
      .from(leadPipelineHistory)
      .where(
        and(
          eq(leadPipelineHistory.leadId, leadId),
          eq(leadPipelineHistory.pipelineId, leaving),
        ),
      )
      .limit(1);
    if (prior.length === 0) {
      const current = (
        await db
          .select({ stageId: leads.stageId })
          .from(leads)
          .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
          .limit(1)
      )[0];
      await db.insert(leadPipelineHistory).values({
        id: nanoid(21),
        orgId,
        leadId,
        pipelineId: leaving,
        stageId: current?.stageId ?? null,
        byUserId: actor.userId,
      });
    }
  }

  // Stages belong to a pipeline, so moving pipeline must move the stage too —
  // otherwise the lead lands on the new board still carrying the old pipeline's
  // stage, and the two disagree. It enters at the new pipeline's first stage.
  const entry = (
    await db
      .select({ id: leadStages.id })
      .from(leadStages)
      .where(and(eq(leadStages.orgId, orgId), eq(leadStages.pipelineId, pipelineId)))
      .orderBy(asc(leadStages.position))
      .limit(1)
  )[0];

  await db
    .update(leads)
    .set({
      pipelineId,
      ...(entry ? { stageId: entry.id } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));

  if (!opts.silent) {
    await db.insert(leadActivities).values({
      id: nanoid(21),
      orgId,
      leadId,
      userId: actor.userId,
      actorName: actor.name,
      kind: "pipeline_change",
      body: `Moved to ${pipeline.name} pipeline`,
    });
  }
}
