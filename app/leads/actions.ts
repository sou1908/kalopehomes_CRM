"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  createLead,
  updateLead,
  setLeadStage,
  setLeadFollowUp,
  deleteLead,
  getLead,
  createLeadStage,
  updateLeadStage,
  deleteLeadStage,
  moveLeadStage,
  logActivity,
  createLeadTag,
  updateLeadTag,
  deleteLeadTag,
  setLeadTags,
  deleteActivity,
  updateActivityBody,
  type ActivityKind,
  LeadError,
} from "@/lib/leads";
import {
  setLeadPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  movePipeline,
  PipelineError,
} from "@/lib/pipelines";
import {
  addLeadAssignee,
  removeLeadAssignee,
  setPrimaryAssignee,
  AssigneeError,
} from "@/lib/assignees";
import { transferLead, escalateToManager, TransferError } from "@/lib/transfer";
import { getPipeline, canWorkPipeline } from "@/lib/pipelines";
import { canWorkLead } from "@/lib/access";
import { saveJourneyStep } from "@/lib/journey";
import { CALL_OUTCOMES } from "@/lib/leads-shared";

// Telecallers (L1), field agents (L2) and the Lead Manager all work leads.
const LEAD_ROLES = ["telecaller", "site_agent", "admin"] as const;

export type LeadFormState = { ok?: boolean; error?: string } | undefined;

function parseValue(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseProb(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Create a lead. Returns state so the composer can stay open or close+refresh. */
export async function createLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization found for your account." };

  try {
    await createLead({
      orgId: user.orgId,
      actor: { userId: user.id, name: user.name },
      data: {
        name: String(formData.get("name") ?? ""),
        company: String(formData.get("company") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        source: String(formData.get("source") ?? ""),
        purpose: String(formData.get("purpose") ?? ""),
        address: String(formData.get("address") ?? ""),
        city: String(formData.get("city") ?? ""),
        state: String(formData.get("state") ?? ""),
        pincode: String(formData.get("pincode") ?? ""),
        country: String(formData.get("country") ?? ""),
        stageId: String(formData.get("stageId") ?? "") || null,
        estimatedValue: parseValue(formData.get("estimatedValue")),
        followUpAt: parseDate(formData.get("followUpAt")),
        notes: String(formData.get("notes") ?? ""),
      },
    });
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  return { ok: true };
}

/** Update a lead's contact details + notes from the detail page. */
export async function updateLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const id = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(id, user.orgId, user.roles))) return { error: "This lead is in another team's pipeline — you can view it, but not change it." };

  try {
    await updateLead(id, user.orgId, {
      name: String(formData.get("name") ?? ""),
      company: String(formData.get("company") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      source: String(formData.get("source") ?? ""),
      purpose: String(formData.get("purpose") ?? ""),
      address: String(formData.get("address") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      pincode: String(formData.get("pincode") ?? ""),
      country: String(formData.get("country") ?? ""),
      estimatedValue: parseValue(formData.get("estimatedValue")),
      // Follow-up date is set on the composer, not the details editor, so we
      // only update it here when the form actually submits the field.
      followUpAt: formData.has("followUpAt")
        ? parseDate(formData.get("followUpAt"))
        : undefined,
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { ok: true };
}

/** Move a lead across pipeline stages (inline stage menu). */
export async function moveLeadStageAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  if (!stageId) return;
  try {
    await setLeadStage(id, user.orgId, stageId, { userId: user.id, name: user.name });
  } catch (err) {
    if (!(err instanceof LeadError)) throw err;
    return;
  }
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath(`/leads/${id}`);
}

// ── Assignees (multiple people per lead) ──────────────────────────────────────

function revalidateLead(id: string) {
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath(`/leads/${id}`);
}

/** Attach a member to a lead (optionally as primary). */
export async function addLeadAssigneeAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const primary = formData.get("primary") != null;
  try {
    await addLeadAssignee(id, user.orgId, userId, { userId: user.id, name: user.name }, { primary });
  } catch (err) {
    if (!(err instanceof AssigneeError)) throw err;
    return;
  }
  revalidateLead(id);
}

/** Remove a member from a lead. */
export async function removeLeadAssigneeAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await removeLeadAssignee(id, user.orgId, userId, { userId: user.id, name: user.name });
  revalidateLead(id);
}

/** Mark one assignee as the primary (demotes the rest). */
export async function setPrimaryAssigneeAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  await setPrimaryAssignee(id, userId);
  revalidateLead(id);
}

/** Move a lead to a pipeline AND hand it to a person there (combined transfer). */
export async function transferLeadAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const id = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(id, user.orgId, user.roles))) return { error: "This lead is in another team's pipeline — you can view it, but not change it." };
  const pipelineId = String(formData.get("pipelineId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!pipelineId || !userId)
    return { error: "Pick both a pipeline and a person to transfer to." };
  try {
    await transferLead(id, user.orgId, pipelineId, userId, {
      userId: user.id,
      name: user.name,
    });

    // A handover note is context for whoever picks it up — logged on the lead
    // so it sits in the timeline they'll read, not buried in the transfer.
    const note = String(formData.get("note") ?? "").trim();
    if (note) {
      await logActivity({
        orgId: user.orgId,
        leadId: id,
        actor: { userId: user.id, name: user.name },
        kind: "note",
        body: note,
      });
    }
  } catch (err) {
    if (err instanceof TransferError) return { error: err.message };
    throw err;
  }
  revalidateLead(id);
  return { ok: true };
}

/** [PROTOTYPE] Save / complete a pipeline's journey step. */
export async function saveJourneyStepAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const leadId = String(formData.get("leadId") ?? "");
  const pipelineId = String(formData.get("pipelineId") ?? "");

  // Each role works its own pipeline. Checked here rather than only in the UI:
  // the pipeline id arrives in the form body, so hiding the form isn't a
  // control — a telecaller could otherwise complete the site agent's step.
  const pipeline = pipelineId ? await getPipeline(pipelineId, user.orgId) : null;
  if (!pipeline) return;
  if (!canWorkPipeline(pipeline, user.roles)) return;
  const complete = String(formData.get("intent") ?? "") === "complete";
  const keys = String(formData.get("fieldKeys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const values: Record<string, string> = {};
  for (const k of keys) values[k] = String(formData.get(`f_${k}`) ?? "").trim();
  await saveJourneyStep({
    leadId,
    orgId: user.orgId,
    pipelineId,
    values,
    complete,
    actor: { userId: user.id, name: user.name },
  });
  revalidatePath(`/leads/${leadId}`);
  if (pipelineId) revalidatePath(`/leads/pipeline/${pipelineId}`);
}

/** Escalate a lead to the Manager pipeline + notify the Lead Manager(s). */
export async function escalateLeadAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  try {
    await escalateToManager(id, user.orgId, { userId: user.id, name: user.name });
  } catch (err) {
    if (!(err instanceof TransferError)) throw err;
    return;
  }
  revalidateLead(id);
}

/** Move a lead to a handling pipeline (inline pipeline menu). */
export async function setLeadPipelineAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  const pipelineId = String(formData.get("pipelineId") ?? "");
  if (!pipelineId) return;
  try {
    await setLeadPipeline(id, user.orgId, pipelineId, { userId: user.id, name: user.name });
  } catch (err) {
    if (!(err instanceof PipelineError)) throw err;
    return;
  }
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath(`/leads/${id}`);
}

// ── Pipeline management ───────────────────────────────────────────────────────────

export async function createPipelineAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  try {
    await createPipeline({
      orgId: user.orgId,
      name: String(formData.get("name") ?? ""),
      color: String(formData.get("color") ?? "") || undefined,
    });
  } catch (err) {
    if (err instanceof PipelineError) return { error: err.message };
    throw err;
  }
  revalidatePipelineSurfaces();
  return { ok: true };
}

export async function updatePipelineAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("pipelineId") ?? "");
  try {
    await updatePipeline(id, user.orgId, {
      name: String(formData.get("name") ?? ""),
      color: String(formData.get("color") ?? "") || undefined,
    });
  } catch (err) {
    if (!(err instanceof PipelineError)) throw err;
  }
  revalidatePipelineSurfaces();
}

export async function deletePipelineAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  try {
    await deletePipeline(String(formData.get("pipelineId") ?? ""), user.orgId);
  } catch (err) {
    if (err instanceof PipelineError) return { error: err.message };
    throw err;
  }
  revalidatePipelineSurfaces();
  return { ok: true };
}

export async function movePipelineOrderAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("pipelineId") ?? "");
  const dir = String(formData.get("direction") ?? "") === "down" ? "down" : "up";
  await movePipeline(id, user.orgId, dir);
  revalidatePipelineSurfaces();
}

function revalidatePipelineSurfaces() {
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath("/leads/pipelines");
}

/** Set or clear a lead's follow-up reminder date. */
export async function setFollowUpAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  await setLeadFollowUp(id, user.orgId, parseDate(formData.get("followUpAt")));
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath(`/leads/${id}`);
}

export async function deleteLeadAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const id = String(formData.get("leadId") ?? "");
  await deleteLead(id, user.orgId);
  redirect("/leads");
}

// ── Stage management ────────────────────────────────────────────────────────

/** Add a custom pipeline stage. */
export async function createLeadStageAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  try {
    await createLeadStage({
      orgId: user.orgId,
      name: String(formData.get("name") ?? ""),
      color: String(formData.get("color") ?? "") || undefined,
      probability: parseProb(formData.get("probability")),
    });
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
  revalidateLeadSurfaces();
  return { ok: true };
}

/** Rename / recolor a stage. */
export async function updateLeadStageAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("stageId") ?? "");
  try {
    await updateLeadStage(id, user.orgId, {
      name: String(formData.get("name") ?? ""),
      color: String(formData.get("color") ?? "") || undefined,
      probability: parseProb(formData.get("probability")),
    });
  } catch (err) {
    if (!(err instanceof LeadError)) throw err;
  }
  revalidateLeadSurfaces();
}

/** Delete a custom stage (guarded server-side: terminal/non-empty stages refuse). */
export async function deleteLeadStageAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const id = String(formData.get("stageId") ?? "");
  try {
    await deleteLeadStage(id, user.orgId);
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
  revalidateLeadSurfaces();
  return { ok: true };
}

/** Reorder a stage one slot left (up) or right (down). */
export async function moveLeadStageOrderAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("stageId") ?? "");
  const dir = String(formData.get("direction") ?? "") === "down" ? "down" : "up";
  await moveLeadStage(id, user.orgId, dir);
  revalidateLeadSurfaces();
}

function revalidateLeadSurfaces() {
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  revalidatePath("/leads/stages");
}

// ── Activity timeline ─────────────────────────────────────────────────────────

const ACTIVITY_KINDS: ActivityKind[] = ["note", "call", "whatsapp", "meeting"];

/** Log a manual activity (note / call / whatsapp / meeting) on a lead. */
export async function addActivityAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const leadId = String(formData.get("leadId") ?? "");
  const lead = await getLead(leadId, user.orgId);
  if (!lead) return { error: "Lead not found." };
  if (!(await canWorkLead(leadId, user.orgId, user.roles))) return { error: "This lead is in another team's pipeline — you can view it, but not change it." };

  const kindRaw = String(formData.get("kind") ?? "note") as ActivityKind;
  const kind = ACTIVITY_KINDS.includes(kindRaw) ? kindRaw : "note";
  const body = String(formData.get("body") ?? "").trim();

  // Call outcome is required for calls; the remark (body) is optional there.
  let outcome: string | null = null;
  if (kind === "call") {
    const oc = String(formData.get("outcome") ?? "").trim();
    outcome = CALL_OUTCOMES.includes(oc) ? oc : CALL_OUTCOMES[0];
  } else if (!body) {
    return { error: "Write something first." };
  }

  const visibility = formData.get("private") != null ? "private" : "public";

  await logActivity({
    orgId: user.orgId,
    leadId,
    actor: { userId: user.id, name: user.name },
    kind,
    body,
    outcome,
    visibility,
  });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

/** Delete a timeline entry made by mistake (author or Lead Manager). */
export async function deleteActivityAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("activityId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  try {
    await deleteActivity(id, user.orgId, {
      userId: user.id,
      isAdmin: user.roles.includes("admin"),
    });
  } catch (err) {
    if (!(err instanceof LeadError)) throw err;
    return;
  }
  revalidatePath(`/leads/${leadId}`);
}

/** Edit the text of a manual timeline entry (author or Lead Manager). */
export async function editActivityAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const id = String(formData.get("activityId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something first." };
  try {
    await updateActivityBody(id, user.orgId, {
      userId: user.id,
      isAdmin: user.roles.includes("admin"),
    }, body);
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

// ── Tags ──────────────────────────────────────────────────────────────────────

/** Create a new CRM tag inline (from the tag picker). */
export async function createLeadTagAction(
  _prev: { error?: string; id?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; id?: string } | undefined> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || "#6a89a8";
  if (!name) return { error: "Tag name required." };
  try {
    const tag = await createLeadTag({ orgId: user.orgId, name, color });
    revalidateLeadSurfaces();
    return { id: tag.id };
  } catch (err) {
    if (err instanceof LeadError) return { error: err.message };
    throw err;
  }
}

/** Rename / recolor a tag. */
export async function updateLeadTagAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("tagId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  try {
    await updateLeadTag(id, user.orgId, {
      name: String(formData.get("name") ?? ""),
      color: String(formData.get("color") ?? "") || undefined,
    });
  } catch (err) {
    if (!(err instanceof LeadError)) throw err;
    return;
  }
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** Delete a tag (removes it from every lead). */
export async function deleteLeadTagAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const id = String(formData.get("tagId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  await deleteLeadTag(id, user.orgId);
  revalidatePath("/leads");
  revalidatePath("/leads/all");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** Replace a lead's tag set. */
export async function setLeadTagsAction(formData: FormData) {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return;
  const _leadId = String(formData.get("leadId") ?? "");
  if (!(await canWorkLead(_leadId, user.orgId, user.roles))) return;
  const leadId = String(formData.get("leadId") ?? "");
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const lead = await getLead(leadId, user.orgId);
  if (!lead) return;
  await setLeadTags(leadId, user.orgId, tagIds);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/leads/all");
}
