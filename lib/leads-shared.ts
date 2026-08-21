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
  /** What to capture while a lead sits in this stage (JSON column, parsed). */
  fields?: string | null;
};

/**
 * The questions a stage asks.
 *
 * A stage that asks nothing asks nothing — several deliberately do, like the
 * exit stage, where the job is to hand over what's already recorded rather than
 * collect more. Falling back to the pipeline's old form there put stale
 * questions ("Site visited?") on a stage well past them.
 *
 * The fallback survives only for a lead with no stage at all.
 */
export function fieldsForStage(
  stage: { name: string; fields?: string | null } | null,
  pipelineName: string,
): JourneyField[] {
  if (stage) return parseJourneyFields(stage.fields);
  return journeyFormFor(pipelineName);
}

/** Client-safe view of a CRM tag row. */
export type LeadTagInfo = { id: string; name: string; color: string };

// ── [PROTOTYPE] Lead journey / milestones ───────────────────────────────────
// Each pipeline has a small form the handler fills, then marks the step done.
export type JourneyFieldType =
  | "text"
  | "yesno"
  | "date"
  | "datetime"
  | "select"
  /** A flat repeatable table — what goes where. */
  | "rows"
  /** Named groups, each with its own rows — measurements per area. */
  | "sections"
  /** Tick-list of things to confirm on site. */
  | "checklist";

/** One column of a `rows` field. */
export type JourneyColumn = {
  key: string;
  label: string;
  /** Renders a dropdown instead of a text box. */
  options?: string[];
  /** Narrow columns (a width, a unit) don't need the same room as a name. */
  narrow?: boolean;
};

export type JourneyField = {
  key: string;
  label: string;
  type: JourneyFieldType;
  options?: string[];
  /** For `rows`: what each row records. */
  columns?: JourneyColumn[];
  /** Shown under the field — say what good input looks like. */
  hint?: string;
  /**
   * This date is a commitment someone has to turn up for, not just a note.
   * Saving it sets the lead's follow-up, so it surfaces in Needs attention and
   * goes overdue if the day passes — which a booked revisit should.
   */
  schedules?: boolean;
};

/** The appointment a stage is asking for, if it asks for one. */
export function scheduleFieldOf(fields: JourneyField[]): JourneyField | null {
  return fields.find((f) => f.schedules) ?? null;
}

/** One row of a `rows` field: column key → value. */
export type JourneyRow = Record<string, string>;

/** Parses a `rows` value, which is stored as JSON in the answer string. */
export function parseJourneyRows(raw: string | null | undefined): JourneyRow[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as JourneyRow[]) : [];
  } catch {
    return [];
  }
}

/** One named group of a `sections` field — an area and its measurements. */
export type JourneySection = { name: string; rows: JourneyRow[] };

export function parseJourneySections(
  raw: string | null | undefined,
): JourneySection[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? (v as JourneySection[]).filter((x) => x && typeof x.name === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * One checklist item's state.
 *
 * Three answers, not a checkbox: an unticked box can't tell "we couldn't do it"
 * from "still to do", and those need different things from the office — one is
 * a problem, the other is a reminder.
 *
 * A remark is allowed on any of them. "No — meter box was locked" tells them
 * more than the answer alone.
 */
export type CheckStatus = "yes" | "no" | "pending";

export type JourneyCheck = { item: string; status: CheckStatus; note?: string };

export const CHECK_STATUSES: CheckStatus[] = ["yes", "no", "pending"];

/**
 * Reads a checklist value, tolerating both earlier shapes: a plain array of
 * ticked labels, and the {item, checked} form that replaced it. A box that was
 * merely unticked becomes "pending" rather than "no" — it never meant the
 * stronger thing.
 */
export function parseJourneyChecks(raw: string | null | undefined): JourneyCheck[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x): JourneyCheck | null => {
        if (typeof x === "string") return { item: x, status: "yes" };
        if (!x || typeof x.item !== "string") return null;
        const note =
          typeof x.note === "string" && x.note.trim() !== "" ? x.note : undefined;
        if (typeof x.status === "string" && CHECK_STATUSES.includes(x.status)) {
          return { item: x.item, status: x.status as CheckStatus, note };
        }
        return { item: x.item, status: x.checked ? "yes" : "pending", note };
      })
      .filter((x): x is JourneyCheck => x !== null);
  } catch {
    return [];
  }
}
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
  /** What to capture while a lead sits in this stage. */
  fields?: JourneyField[];
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
      {
        name: "Interested",
        color: "#f97316",
        kind: "open",
        position: 30,
        probability: 50,
        fields: [
          { key: "requirement", label: "What they want", type: "text" },
          { key: "visit_scheduled", label: "Site visit booked for", type: "datetime", schedules: true },
        ],
      },
      {
        name: "Not interested",
        color: "#ef4444",
        kind: "lost",
        position: 90,
        probability: 0,
        // The loss reason, captured at the moment it's known rather than as a
        // separate feature nobody remembers to fill in.
        fields: [
          {
            key: "lost_reason",
            label: "Why not?",
            type: "select",
            options: [
              "Not interested",
              "Budget too low",
              "Out of our area",
              "Already done elsewhere",
              "Wrong number",
              "Never reachable",
            ],
          },
          { key: "lost_note", label: "Anything else", type: "text" },
        ],
      },
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
      {
        name: "Visit scheduled",
        color: "#d99756",
        kind: "open",
        position: 10,
        probability: 55,
        fields: [
          { key: "visit_at", label: "Visit date & time", type: "datetime", schedules: true },
          { key: "visit_note", label: "Notes for the visit", type: "text" },
        ],
      },
      {
        name: "Visited",
        color: "#f97316",
        kind: "open",
        position: 20,
        probability: 70,
        fields: [
          {
            key: "site_checklist",
            label: "On-site checklist",
            type: "checklist",
            hint: "Tick what was done. Anything left unticked is what the office chases.",
            options: [
              "All areas measured",
              "Photos taken",
              "Video taken",
              "Electrical points noted",
              "Plumbing points noted",
              "Budget discussed",
              "Timeline discussed",
              "Catalogue / samples shown",
            ],
          },
          {
            key: "measurements",
            label: "Measurements",
            type: "sections",
            hint: "Add the area you measured, then its dimensions. One section per area.",
            // Suggestions, not a fixed list — the name box accepts anything.
            options: [
              "Kitchen",
              "Wardrobe",
              "Living room",
              "Bedroom",
              "Bathroom",
              "Balcony",
              "Study",
              "Pooja room",
            ],
            columns: [
              { key: "part", label: "Part / wall" },
              { key: "width", label: "Width", narrow: true },
              { key: "height", label: "Height", narrow: true },
              { key: "depth", label: "Depth", narrow: true },
              {
                key: "unit",
                label: "Unit",
                narrow: true,
                options: ["ft", "in", "mm", "m"],
              },
            ],
          },
          { key: "office_visit", label: "Office visit too?", type: "yesno" },
          { key: "office_at", label: "Office visit date & time", type: "datetime" },
          { key: "visit_outcome", label: "How did it go?", type: "text" },
        ],
      },
      {
        name: "Revisit needed",
        color: "#8c8170",
        kind: "open",
        position: 30,
        probability: 40,
        fields: [
          { key: "revisit_why", label: "Why a revisit?", type: "text" },
          { key: "revisit_at", label: "Revisit booked for", type: "datetime", schedules: true },
        ],
      },
      {
        // Where the visit turns into a number. The payment thread starts here:
        // whether an advance came in is the difference between a quote sent and
        // a job beginning.
        name: "Quotation",
        color: "#6a89a8",
        kind: "open",
        position: 40,
        probability: 80,
        fields: [
          { key: "quote_amount", label: "Quotation amount (₹)", type: "text" },
          { key: "quote_shared_at", label: "Shared with customer on", type: "datetime" },
          {
            key: "advance_status",
            label: "Advance",
            type: "select",
            options: ["Received", "Promised", "Not yet"],
          },
          { key: "advance_amount", label: "Advance amount (₹)", type: "text" },
          { key: "quote_note", label: "Notes", type: "text" },
        ],
      },
      {
        // Distinct from "Visit cancelled": they saw us and said no, rather than
        // the visit never happening. Different reasons, and different lessons.
        name: "Not interested",
        color: "#ef4444",
        kind: "lost",
        position: 80,
        probability: 0,
        fields: [
          {
            key: "lost_reason",
            label: "Why not?",
            type: "select",
            options: [
              "Price too high",
              "Design not liked",
              "Postponed the project",
              "Went with someone else",
              "Space not suitable",
              "Stopped responding",
            ],
          },
          { key: "lost_note", label: "Anything else", type: "text" },
        ],
      },
      {
        name: "Visit cancelled",
        color: "#ef4444",
        kind: "lost",
        position: 90,
        probability: 0,
        fields: [
          {
            key: "cancel_reason",
            label: "Why cancelled?",
            type: "select",
            options: [
              "Customer postponed",
              "Customer not available",
              "Wrong address",
              "No longer interested",
            ],
          },
        ],
      },
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

/**
 * When a lead arrived, as short as it can be while still being clear.
 *
 * "Today" and "Yesterday" rather than a date, because on a board the question
 * is almost always "is this fresh?" — and a caller reading a column of dates
 * has to work that out for every card. The year only appears once it isn't
 * this one, so the common case stays two words wide.
 *
 * `now` is passed in rather than read, so the server and the browser can't
 * disagree about what "today" means and produce a hydration mismatch.
 */
export function formatAdded(
  at: Date | null | undefined,
  now: number,
): string | null {
  if (!at) return null;

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(at)) / 86_400_000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() !== new Date(now).getFullYear() ? { year: "2-digit" } : {}),
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

/**
 * A stage answer in one short phrase, for the activity timeline.
 *
 * Tables and checklists are summarised rather than spelled out — the timeline
 * should say a measurement was taken, not reprint five columns. The journey
 * panel is where the detail lives.
 */
export function describeJourneyValue(
  field: JourneyField,
  raw: string,
): string | null {
  const v = (raw ?? "").trim();
  if (v === "" || v === "[]") return null;

  if (field.type === "checklist") {
    const checks = parseJourneyChecks(v);
    const n = (st: CheckStatus) => checks.filter((c) => c.status === st).length;
    const no = checks.filter((c) => c.status === "no").map((c) => c.item);
    const head = `${n("yes")} yes · ${n("no")} no`;
    return no.length > 0 ? `${head} (no: ${no.join(", ")})` : head;
  }

  if (field.type === "sections") {
    const secs = parseJourneySections(v);
    if (secs.length === 0) return null;
    return secs.map((x) => x.name).join(", ");
  }

  if (field.type === "rows") {
    const rows = parseJourneyRows(v);
    if (rows.length === 0) return null;
    return `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  }

  return formatJourneyValue(v, field.type);
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
