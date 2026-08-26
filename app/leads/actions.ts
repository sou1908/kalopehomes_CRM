"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  createLead,
  updateLead,
  setLeadStage,
  setLeadFollowUp,
  getStage,
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
import {
  transferLead,
  escalateToManager,
  undoTransfer,
  TransferError,
} from "@/lib/transfer";
import { getPipeline, canWorkPipeline } from "@/lib/pipelines";
import { listAssignableMembers } from "@/lib/members";
import { rolesCanWorkPipeline } from "@/lib/roles-shared";
import { canWorkLead } from "@/lib/access";
// TEMPORARY — testing only, remove before launch.
import { deleteAllLeads } from "@/lib/danger";
import { saveJourneyStep } from "@/lib/journey";
import {
  CALL_OUTCOMES,
  fieldsForStage,
  scheduleFieldOf,
  describeJourneyValue,
} from "@/lib/leads-shared";

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

  // A bare yyyy-mm-dd is parsed as UTC midnight by the Date constructor, which
  // in IST lands at 05:30 the same morning — so an all-day reminder would come
  // back as "5:30 am". Build it as local midnight instead, which is what the
  // rest of the app treats as "no time given".
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

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

  // The recipient must actually work the destination. The picker only offers
  // eligible people, but a filtered dropdown is a convenience, not a rule —
  // without this a crafted request could park a lead on someone who has no role
  // for that pipeline and will never see it on their board.
  const target = await getPipeline(pipelineId, user.orgId);
  if (!target) return { error: "That pipeline no longer exists." };
  const recipient = (await listAssignableMembers(user.orgId)).find(
    (m) => m.id === userId,
  );
  if (!recipient) return { error: "That person is not a member of this team." };
  if (!rolesCanWorkPipeline(target.roles, recipient.roles)) {
    return {
      error: `${recipient.name} doesn't work ${target.name}. Pick someone with that role, or give them one under Members.`,
    };
  }

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
  // The board is /leads?pipeline=<id>; revalidating the path covers it,
  // query string and all. There is no /leads/pipeline/<id> route.
  if (pipelineId) revalidatePath("/leads");
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

// Structure is admin-only. Renaming a stage or deleting a pipeline reshapes
// the board for every role at once, and there is no undo — a telecaller
// tidying up their own view would take everyone else's work with it.
// ── Pipeline management ───────────────────────────────────────────────────────────

export async function createPipelineAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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

// Structure is admin-only. Renaming a stage or deleting a pipeline reshapes
// the board for every role at once, and there is no undo — a telecaller
// tidying up their own view would take everyone else's work with it.
// ── Stage management ────────────────────────────────────────────────────────

/** Add a custom pipeline stage. */
export async function createLeadStageAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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
  const user = await requireRole(["admin"]);
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
  const visibility = formData.get("private") != null ? "private" : "public";

  // ── Whatever the stage asked for, filled in alongside the note ──
  const stage = lead.stageId ? await getStage(lead.stageId, user.orgId) : null;
  const stageFields = stage ? fieldsForStage(stage, "") : [];
  const stageKeys = String(formData.get("fieldKeys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const values: Record<string, string> = {};
  for (const k of stageKeys) {
    const v = String(formData.get(`f_${k}`) ?? "").trim();
    if (v && v !== "[]") values[k] = v;
  }

  // Each answer in a phrase, so the timeline shows what was recorded rather
  // than leaving it only in the journey, which keeps no history.
  const recorded = Object.entries(values)
    .map(([key, raw]) => {
      const field = stageFields.find((f) => f.key === key);
      if (!field) return null;
      const said = describeJourneyValue(field, raw);
      return said ? `${field.label}: ${said}` : null;
    })
    .filter((x): x is string => x !== null);

  // A call needs its outcome; the remark is optional there. For anything else,
  // filling in the stage counts as saying something — being made to write a
  // note as well is busywork.
  let outcome: string | null = null;
  if (kind === "call") {
    const oc = String(formData.get("outcome") ?? "").trim();
    outcome = CALL_OUTCOMES.includes(oc) ? oc : CALL_OUTCOMES[0];
  } else if (!body && recorded.length === 0) {
    return { error: "Write a note, or fill in something below." };
  }

  const summary = recorded.length > 0 ? `Recorded — ${recorded.join(" · ")}` : "";
  const finalBody = [body, summary].filter(Boolean).join("\n");

  await logActivity({
    orgId: user.orgId,
    leadId,
    actor: { userId: user.id, name: user.name },
    kind,
    body: finalBody,
    outcome,
    visibility,
  });

  if (Object.keys(values).length > 0 && lead.pipelineId) {
    await saveJourneyStep({
      leadId,
      orgId: user.orgId,
      pipelineId: lead.pipelineId,
      values,
      complete: false,
      actor: { userId: user.id, name: user.name },
    });

    // A stage can ask for an appointment — a revisit, a site visit. That's a
    // commitment someone has to turn up for, so it becomes the lead's
    // follow-up: it then surfaces in Needs attention and goes overdue if the
    // day passes, which is the whole point of booking it.
    const appointment = scheduleFieldOf(stageFields);
    const when = appointment ? values[appointment.key] : undefined;
    if (when) {
      const at = parseDate(when);
      if (at) await setLeadFollowUp(leadId, user.orgId, at);
    }
  }

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

/**
 * Put a lead back where it was before its last transfer.
 *
 * Not gated by `canWorkLead` — by definition the lead has left your pipeline,
 * so that check would always fail. `undoTransfer` authorises on the pipeline it
 * came FROM instead, and refuses once the receiving team has started.
 */
export async function undoTransferAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole([...LEAD_ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const id = String(formData.get("leadId") ?? "");
  try {
    await undoTransfer(id, user.orgId, { userId: user.id, name: user.name }, user.roles);
  } catch (err) {
    if (err instanceof TransferError) return { error: err.message };
    throw err;
  }
  revalidateLead(id);
  revalidatePipelineSurfaces();
  return { ok: true };
}

/**
 * ⚠️ TEMPORARY — TESTING ONLY, REMOVE BEFORE LAUNCH. See lib/danger.ts.
 *
 * Admin-only, and requires the confirmation phrase to be typed exactly — a
 * button that empties the database shouldn't be reachable by one stray click.
 */
export async function deleteAllLeadsAction(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireRole(["admin"]);
  if (!user.orgId) return { error: "No organization." };

  if (String(formData.get("confirm") ?? "").trim() !== "DELETE ALL LEADS") {
    return { error: "Type DELETE ALL LEADS exactly to confirm." };
  }

  const { deleted, backup } = await deleteAllLeads(user.orgId);
  console.warn(
    `[danger] ${user.email} deleted all ${deleted} leads. Snapshot: ${backup}`,
  );
  revalidatePipelineSurfaces();
  return { ok: true };
}
