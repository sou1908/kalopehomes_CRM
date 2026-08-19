import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Tenant boundary. One row today (the agency); multi-tenant later is just
// allowing more orgs + a signup flow. Every top-level entity is scoped by orgId.
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  // Nullable only so pre-org rows can exist before bootstrap backfills them;
  // every live user belongs to exactly one org in v0.
  orgId: text("org_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  lastNotificationsReadAt: integer("last_notifications_read_at", {
    mode: "timestamp_ms",
  }),
  // Caller availability — self-set (and admin-overridable) presence shown to the
  // team. Defaults to offline; set to 'available' on login, 'offline' on logout.
  presence: text("presence", {
    enum: ["available", "busy", "on_call", "offline"],
  })
    .notNull()
    .default("offline"),
  presenceUpdatedAt: integer("presence_updated_at", { mode: "timestamp_ms" }),
  // Last time this user opened the team chat — drives the unread-message badge.
  lastChatReadAt: integer("last_chat_read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Stackable roles: a user can hold several rows (e.g. admin AND
// telecaller). Permissions derive from the set, not a single column.
export const userRoles = sqliteTable("user_roles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["admin", "telecaller", "site_agent", "operation_manager"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// Shared to-do list. `userId` is the ASSIGNEE (whose list it shows on);
// `creatorUserId` is who created/assigned it. Self-created to-dos have the two
// equal. Either party may complete/edit it.
export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Who assigned it. Null only for legacy rows before this column existed
  // (backfilled to userId in bootstrap-time migration). SET NULL if that
  // account is removed — the to-do stays on the assignee's list.
  creatorUserId: text("creator_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
    .notNull()
    .default("normal"),
  dueDate: integer("due_date", { mode: "timestamp_ms" }),
  remindAt: integer("remind_at", { mode: "timestamp_ms" }),
  // JSON array of { url, name } — files attached to the to-do.
  attachments: text("attachments").notNull().default("[]"),
  sortOrder: real("sort_order"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// In-app notifications for members (the Inbox): to-do + lead assignment, the
// daily follow-up digest, etc.
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  actorName: text("actor_name"),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Notification = typeof notifications.$inferSelect;

// Chat — both the org-wide team room AND 1:1 direct messages live here.
//  • recipientUserId NULL  → team room (everyone in the org sees it)
//  • recipientUserId set   → a direct message between userId (sender) and it
// Sender name is denormalised so a deleted account's messages still read (userId
// SET NULL). A DM is removed if either participant is deleted (recipient CASCADE).
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  recipientUserId: text("recipient_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// Per-conversation read pointers for direct messages. (The team room uses
// users.lastChatReadAt instead.) PK (user_id, peer_user_id) defined in the boot
// migration; one row per (reader, the person they're talking to).
export const dmReads = sqliteTable("dm_reads", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  peerUserId: text("peer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: integer("last_read_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Sales leads (the CRM core) — potential clients a telecaller nurtures through a
// pipeline. Org-scoped, owned/assigned to a staff member.
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // The staff member responsible for this lead (the assigned owner). SET NULL so
  // removing an account leaves the lead un-owned rather than deleting it.
  ownerUserId: text("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  source: text("source"),
  // What the client wants (type of work).
  purpose: text("purpose"),
  // Legacy keyword stage (new/contacted/…). Superseded by stageId; kept so old
  // rows stay valid and the bootstrap backfill can map them to a stage row.
  stage: text("stage").notNull().default("new"),
  // The pipeline stage this lead sits in — a per-org lead_stages row, so a lead
  // manager can add their own stages. SET NULL if a stage is deleted (the board
  // then buckets it into the first stage until reassigned).
  stageId: text("stage_id").references(() => leadStages.id, {
    onDelete: "set null",
  }),
  // Estimated deal value in whole rupees (nullable). Kept simple — no currency.
  estimatedValue: integer("estimated_value"),
  // Next follow-up date. Drives the "Needs attention" view + overdue badges.
  followUpAt: integer("follow_up_at", { mode: "timestamp_ms" }),
  // Postal address, broken into parts. `address` holds the street/area line.
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  country: text("country"),
  notes: text("notes").notNull().default(""),
  // The pipeline this lead is currently being worked in — i.e. whose queue it
  // sits in. `stageId` must always be a stage belonging to this pipeline.
  pipelineId: text("pipeline_id").references(() => pipelines.id, {
    onDelete: "set null",
  }),
  // [PROTOTYPE] Per-pipeline journey/milestone data, JSON keyed by pipelineId:
  // { [pipelineId]: { done, by, at, fields: {key: value} } }. See lib/journey.ts.
  journey: text("journey").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Lead = typeof leads.$inferSelect;

// Pipelines — one per role, in the order a lead travels them (Telecalling →
// Site Visit → Operations). Each owns its own stages, so every role works a
// board built from its own vocabulary rather than a shared sales funnel.
// Per-org and user-definable, ordered by position.
export const pipelines = sqliteTable("pipelines", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6a89a8"),
  position: integer("position").notNull().default(0),
  // Roles that work this pipeline, as a JSON array of role keys. Admins see
  // every pipeline regardless. Empty = nobody but admins.
  roles: text("roles").notNull().default("[]"),
  // The step form for this pipeline, as a JSON array of JourneyField. Lives on
  // the row (not keyed by name in code) so renaming a pipeline can't orphan it.
  fields: text("fields").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type LeadPipelineHistory = typeof leadPipelineHistory.$inferSelect;

// Multiple staff can work one lead at once (e.g. a telecaller AND a field agent).
// One row per (lead, user); `isPrimary` marks the main responsible person.
// PK (lead_id, user_id) defined in the boot migration.
export const leadAssignees = sqliteTable("lead_assignees", {
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  addedByUserId: text("added_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  addedAt: integer("added_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// Per-org, user-definable pipeline stages. Seeded with defaults in bootstrap
// (New/Contacted/Qualified/Won/Lost); a lead manager can add their own 'open'
// stages. `kind` keeps the won/lost semantics that drive the forecast math
// regardless of how stages are named. `position` orders the columns left → right.
export const leadStages = sqliteTable("lead_stages", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Which pipeline this stage belongs to. Each role has its own pipeline, so
  // "Won" means something different in each: for the telecaller it means handed
  // over to a site agent, not a sale.
  pipelineId: text("pipeline_id").references(() => pipelines.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6a89a8"),
  kind: text("kind", { enum: ["open", "won", "lost"] })
    .notNull()
    .default("open"),
  position: integer("position").notNull().default(0),
  // Win probability 0–100 for the weighted forecast. Null → derived from kind.
  probability: integer("probability"),
  // Reaching this stage completes the pipeline and hands the lead to the next
  // one. Only one per pipeline is meaningful.
  isExit: integer("is_exit", { mode: "boolean" }).notNull().default(false),
  // What to capture while a lead sits in this stage, as a JSON array of
  // JourneyField. Per stage rather than per pipeline: "when is the visit" only
  // makes sense at Visit scheduled, and asking it everywhere is noise.
  fields: text("fields").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * A lead's completed run through one pipeline. Written on handoff, so the
 * telecaller keeps seeing a lead as Won in *their* pipeline while the site
 * agent works it in theirs — a lead only has one current stage, so the finished
 * ones have to be recorded rather than inferred.
 */
export const leadPipelineHistory = sqliteTable("lead_pipeline_history", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  pipelineId: text("pipeline_id").references(() => pipelines.id, {
    onDelete: "cascade",
  }),
  /** The stage the lead left on — normally that pipeline's exit stage. */
  stageId: text("stage_id").references(() => leadStages.id, {
    onDelete: "set null",
  }),
  byUserId: text("by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type LeadStage = typeof leadStages.$inferSelect;

// CRM tags applied to leads (segmentation: Hot / Enterprise / Referral …).
export const leadTags = sqliteTable("lead_tags", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6a89a8"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const leadTagLinks = sqliteTable("lead_tag_links", {
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tagId: text("tag_id")
    .notNull()
    .references(() => leadTags.id, { onDelete: "cascade" }),
});

export type LeadTag = typeof leadTags.$inferSelect;

// Per-lead activity log: notes + logged calls/WhatsApp/meetings, plus auto-logged
// stage changes and ownership assignment. The backbone of the detail timeline.
export const leadActivities = sqliteTable("lead_activities", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  // Who did it (null if the account was later removed).
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull(),
  kind: text("kind", {
    enum: [
      "note",
      "call",
      "whatsapp",
      "email",
      "meeting",
      "stage_change",
      "created",
      "converted",
      "assigned",
      "pipeline_change",
      "transferred",
    ],
  }).notNull(),
  // Call outcome (Connected / Not connected / …) — only set for `call` kind.
  outcome: text("outcome"),
  // Note visibility: `public` is shared with the whole team (default); `private`
  // is a personal note visible only to its author.
  visibility: text("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("public"),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type LeadActivity = typeof leadActivities.$inferSelect;

// Tracks the last day the follow-up digest ran per org, so the daily nudge fires
// at most once per calendar day no matter how many times the app is opened.
export const digestState = sqliteTable("digest_state", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Local calendar day, "YYYY-MM-DD".
  lastRunDate: text("last_run_date"),
});

export type Role = "admin" | "telecaller" | "site_agent" | "operation_manager";

export type Organization = typeof organizations.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type User = typeof users.$inferSelect;
