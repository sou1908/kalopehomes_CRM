// Client-safe lead-pipeline metadata + pure helpers. NO server-only / db imports
// so the board, stage menu, and forms can use these. Stages are now per-org rows
// (see lib/leads.ts + the lead_stages table); this file only holds the shape,
// the default seed, a color palette, and pure rollups.

export type LeadStageKind = "open" | "won" | "lost";

/** Client-safe view of a pipeline stage row. */
export type LeadStageInfo = {
  id: string;
  name: string;
  color: string; // hex
  kind: LeadStageKind;
  position: number;
  probability?: number | null; // 0–100; null → derived from kind
  /** The pipeline this stage belongs to — clients filter on it. */
  pipelineId?: string | null;
  /** Reaching it completes the pipeline and hands the lead on. */
  isExit?: boolean;
};

/** Client-safe view of a CRM tag row. */
export type LeadTagInfo = { id: string; name: string; color: string };

// ── [PROTOTYPE] Lead journey / milestones ───────────────────────────────────
// Each pipeline has a small form the handler fills, then marks the step done.
export type JourneyFieldType =
  | "text"
  | "yesno"
  | "date"
  | "datetime"
  | "select";
export type JourneyField = {
  key: string;
  label: string;
  type: JourneyFieldType;
  options?: string[];
};

// Default fields per pipeline, matched by pipeline name (lower-cased). Unknown pipelines
// fall back to a single Notes field. Make these configurable later if kept.
export const JOURNEY_FORMS: Record<string, JourneyField[]> = {
  telecalling: [
    { key: "connected", label: "Call connected?", type: "yesno" },
    { key: "interested", label: "Interested?", type: "yesno" },
    { key: "requirement", label: "Requirement / notes", type: "text" },
    // Booked on the call, so the site agent receives a lead with the visit
    // already in the diary rather than having to chase for a slot.
    { key: "visit_scheduled", label: "Site visit scheduled for", type: "datetime" },
  ],
  "site visit": [
    { key: "visited", label: "Site visited?", type: "yesno" },
    { key: "visit_date", label: "Visit date", type: "date" },
    { key: "office_visit", label: "Office visit?", type: "yesno" },
    { key: "office_date", label: "Office visit date", type: "date" },
    { key: "notes", label: "Notes", type: "text" },
  ],
  manager: [
    { key: "decision", label: "Decision", type: "select", options: ["Won", "Lost", "Follow-up"] },
    { key: "notes", label: "Notes", type: "text" },
  ],
};

export const DEFAULT_JOURNEY_FORM: JourneyField[] = [
  { key: "notes", label: "Notes", type: "text" },
];

export function journeyFormFor(pipelineName: string): JourneyField[] {
  return JOURNEY_FORMS[pipelineName.trim().toLowerCase()] ?? DEFAULT_JOURNEY_FORM;
}

export type JourneyStep = {
  done: boolean;
  by: string | null;
  at: number | null;
  fields: Record<string, string>;
};
export type JourneyData = Record<string, JourneyStep>;

export function parseJourney(raw: string | null | undefined): JourneyData {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JourneyData;
  } catch {
    return {};
  }
}

// Seeded once per org in bootstrap. Spaced positions leave room to insert custom
// pipelines (e.g. Closing/Sales) between the defaults without renumbering.
/**
 * The pipelines seeded for a new org, in the order a lead travels them. Each
 * belongs to one role and carries its own stages, so "Won" reads correctly in
 * every one: for the telecaller it means the lead was successfully handed to a
 * site agent, not that a sale closed.
 *
 * All of it is editable per org — these are only the starting point.
 */
export type PipelineStageSeed = {
  name: string;
  color: string;
  kind: LeadStageKind;
  position: number;
  probability: number;
  /** Reaching this stage completes the pipeline and hands the lead on. */
  isExit?: boolean;
};

export const DEFAULT_PIPELINES: Array<{
  name: string;
  color: string;
  position: number;
  roles: string[];
  stages: PipelineStageSeed[];
}> = [
  {
    // Raw ad/local data lands here and gets called through one by one.
    name: "Telecalling",
    color: "#6a89a8",
    position: 10,
    roles: ["telecaller"],
    stages: [
      { name: "New", color: "#6a89a8", kind: "open", position: 10, probability: 10 },
      { name: "Interested", color: "#f97316", kind: "open", position: 30, probability: 50 },
      { name: "Not interested", color: "#ef4444", kind: "lost", position: 90, probability: 0 },
      {
        name: "Handed over",
        color: "#10b981",
        kind: "won",
        position: 100,
        probability: 100,
        isExit: true,
      },
    ],
  },
  {
    name: "Site Visit",
    color: "#d99756",
    position: 20,
    roles: ["site_agent"],
    stages: [
      { name: "Visit scheduled", color: "#d99756", kind: "open", position: 10, probability: 55 },
      { name: "Visited", color: "#f97316", kind: "open", position: 20, probability: 70 },
      { name: "Revisit needed", color: "#8c8170", kind: "open", position: 30, probability: 40 },
      { name: "Visit cancelled", color: "#ef4444", kind: "lost", position: 90, probability: 0 },
      {
        name: "Sent to operations",
        color: "#10b981",
        kind: "won",
        position: 100,
        probability: 100,
        isExit: true,
      },
    ],
  },
  {
    // Placeholder — the operations flow is still to be defined, so these three
    // are the minimum that keeps the board usable until it is.
    name: "Operations",
    color: "#7c9e6d",
    position: 30,
    roles: ["operation_manager"],
    stages: [
      { name: "In discussion", color: "#6a89a8", kind: "open", position: 10, probability: 70 },
      { name: "Lost", color: "#ef4444", kind: "lost", position: 90, probability: 0 },
      { name: "Won", color: "#10b981", kind: "won", position: 100, probability: 100 },
    ],
  },
];

/** Client-safe view of a pipeline. */
export type PipelineInfo = {
  id: string;
  name: string;
  color: string;
  position: number;
  roles: string[];
};

/** Parses the `roles` JSON column, tolerating anything malformed. */
/** Parses a pipeline's `fields` JSON column into its step-form definition. */
export function parseJourneyFields(raw: string | null | undefined): JourneyField[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as JourneyField[]) : [];
  } catch {
    return [];
  }
}

export function parsePipelineRoles(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Compact lead shape for @mention pickers + chat chips. `open` = in an open stage. */
export type LeadMention = {
  id: string;
  name: string;
  company: string | null;
  open: boolean;
};

// Seeded once per org in bootstrap. Spaced positions leave room to insert/reorder
// custom 'open' stages between Qualified and Won without renumbering everything.
export const DEFAULT_LEAD_STAGES: Array<{
  name: string;
  color: string;
  kind: LeadStageKind;
  position: number;
  probability: number;
}> = [
  { name: "New", color: "#6a89a8", kind: "open", position: 10, probability: 10 },
  { name: "Contacted", color: "#f97316", kind: "open", position: 20, probability: 30 },
  { name: "Qualified", color: "#d99756", kind: "open", position: 30, probability: 60 },
  { name: "Won", color: "#10b981", kind: "won", position: 90, probability: 100 },
  { name: "Lost", color: "#ef4444", kind: "lost", position: 100, probability: 0 },
];

// Seeded CRM tags an org starts with (editable/extendable later).
export const DEFAULT_LEAD_TAGS: Array<{ name: string; color: string }> = [
  { name: "Hot", color: "#ef4444" },
  { name: "Warm", color: "#d99756" },
  { name: "Cold", color: "#6a89a8" },
  { name: "Referral", color: "#10b981" },
  { name: "Enterprise", color: "#8b5cf6" },
];

/** Win probability for a stage — explicit value, else a sensible default by kind. */
export function stageProbability(stage: {
  kind: LeadStageKind;
  probability?: number | null;
}): number {
  if (stage.probability != null && Number.isFinite(stage.probability)) {
    return Math.max(0, Math.min(100, stage.probability));
  }
  return stage.kind === "won" ? 100 : stage.kind === "lost" ? 0 : 50;
}

export type FollowUpState = "overdue" | "soon" | "later";

/**
 * Classify a follow-up date relative to `now`. "soon" = within 3 days.
 * Returns null when there's no date set.
 */
export function followUpState(
  followUpAt: Date | number | null | undefined,
  now: number,
): FollowUpState | null {
  if (followUpAt == null) return null;
  const t = followUpAt instanceof Date ? followUpAt.getTime() : followUpAt;
  const dayMs = 24 * 60 * 60 * 1000;
  if (t < now) return "overdue";
  if (t <= now + 3 * dayMs) return "soon";
  return "later";
}

/**
 * A dialable href for a phone number as it was typed. Keeps a leading + so
 * international numbers still dial, and strips everything else — imported
 * numbers arrive with spaces, dashes and brackets in every combination.
 * Returns null when there aren't enough digits to be a number at all.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * A follow-up as it should read. Midnight means the date was set without a
 * time, so the time is left off rather than shown as a misleading "12:00 am" —
 * "call after 6pm" and "sometime on the 9th" are different promises.
 */
export function formatFollowUp(
  at: Date | null | undefined,
  opts: { withYear?: boolean } = {},
): string | null {
  if (!at) return null;
  const hasTime = at.getHours() !== 0 || at.getMinutes() !== 0;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(opts.withYear ? { year: "numeric" } : {}),
    ...(hasTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(at);
}

/** Renders a captured journey answer — dates read as dates, not raw strings. */
export function formatJourneyValue(
  value: string,
  type: JourneyFieldType,
): string {
  if (type !== "date" && type !== "datetime") return value;
  const v = value.trim();
  if (!v) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
  if (!m) return value;
  const hasTime = m[4] != null && !(m[4] === "00" && m[5] === "00");
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(d);
}

// Outcomes for a logged call.
export const CALL_OUTCOMES: string[] = [
  "Connected",
  "Not connected",
  "Declined",
  "Switched off",
  "Busy",
  "Wrong number",
  "Callback requested",
];

// What the lead wants done — offered in the Purpose dropdown. Interior and
// modular work, drawn from what Kalope Homes actually advertises: the running
// campaigns are uPVC interiors, modular kitchen and wall panelling.
//
// Not a fixed set — the field keeps "Other → please specify", and any value
// already stored that isn't listed here still opens as Other with its text
// intact, so nothing captured before this list changed is lost.
export const LEAD_PURPOSES: string[] = [
  "Modular kitchen",
  "uPVC interiors",
  "Wall panelling",
  "Wardrobe",
  "Full home interior",
  "False ceiling",
  "TV unit / living room",
  "Bedroom",
  "Flooring",
  "Painting",
  "Renovation",
  "Commercial / office interior",
  "Other",
];

// Common lead sources offered in the Source dropdown.
export const LEAD_SOURCES: string[] = [
  "Referral",
  "Website",
  "Social media",
  "Cold outreach",
  "Email",
  "Event",
  "Advertisement",
  "Marketplace",
  "Other",
];

// Palette offered in the "add stage" color picker (matches the app's tokens).
export const STAGE_COLOR_PALETTE: string[] = [
  "#6a89a8",
  "#f97316",
  "#d99756",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#7c9e6d",
  "#b85a3d",
];

/** Format an estimated value (whole rupees) for display, e.g. "₹1,20,000". */
export function formatValue(rupees: number | null | undefined): string | null {
  if (rupees == null || !Number.isFinite(rupees)) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export type LeadSummary = {
  total: number;
  open: number; // in 'open'-kind stages
  won: number;
  lost: number;
  byStage: Record<string, number>; // keyed by stage id
  openValue: number; // estimated ₹ still in play
  wonValue: number; // estimated ₹ of converted leads
  conversionRate: number; // won / (won + lost), 0..1
};

type SummarizableLead = {
  stageId: string | null;
  estimatedValue?: number | null;
};

/** Roll up pipeline metrics from a lead list + the org's stages. Pure. */
export function summarize(
  leads: SummarizableLead[],
  stages: LeadStageInfo[],
): LeadSummary {
  const kindById = new Map(stages.map((s) => [s.id, s.kind] as const));
  const byStage: Record<string, number> = {};
  for (const s of stages) byStage[s.id] = 0;

  let open = 0;
  let won = 0;
  let lost = 0;
  let openValue = 0;
  let wonValue = 0;

  for (const l of leads) {
    if (l.stageId && byStage[l.stageId] != null) byStage[l.stageId] += 1;
    const kind = (l.stageId && kindById.get(l.stageId)) || "open";
    const v = l.estimatedValue ?? 0;
    if (kind === "won") {
      won += 1;
      wonValue += v;
    } else if (kind === "lost") {
      lost += 1;
    } else {
      open += 1;
      openValue += v;
    }
  }

  const closed = won + lost;
  return {
    total: leads.length,
    open,
    won,
    lost,
    byStage,
    openValue,
    wonValue,
    conversionRate: closed > 0 ? won / closed : 0,
  };
}
