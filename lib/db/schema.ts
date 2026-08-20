import {
  mysqlTable,
  varchar,
  text,
  int,
  double,
  boolean,
  customType,
} from "drizzle-orm/mysql-core";

/**
 * Every timestamp in this schema is epoch milliseconds in a BIGINT, presented
 * to the application as a JS Date.
 *
 * MySQL's own DATETIME would be the idiomatic choice, but it stores wall-clock
 * time with no zone, so what you get back depends on the session timezone of
 * whoever is connected. We already lost half a day to a timezone bug where a
 * bare date parsed as UTC midnight and surfaced as 5:30 am IST; a column type
 * that reintroduces that ambiguity across every date in the CRM is not worth
 * the idiom. Epoch milliseconds is one absolute instant everywhere.
 *
 * It also keeps this port honest: SQLite stored exactly these integers, so the
 * numbers carry across unchanged and no application code has to be rewritten.
 *
 * mysql2 hands BIGINT back as a string to avoid precision loss, so fromDriver
 * accepts either shape.
 *
 * The value is generated in JS rather than by the server, because MySQL only
 * allows a function call as a column default from 8.0.13 onward and we do not
 * control the host's version.
 */
const timestampMs = customType<{
  data: Date;
  driverData: string | number;
}>({
  dataType() {
    return "bigint";
  },
  toDriver(value: Date): number {
    return value.getTime();
  },
  fromDriver(value: string | number): Date {
    return new Date(Number(value));
  },
});

/**
 * Identifier width. nanoid(21) for rows, nanoid(40) for session tokens.
 *
 * MySQL cannot index an unbounded TEXT, and a foreign key must match the
 * referenced column's type exactly — so every id and every column pointing at
 * one uses these two constants rather than a literal.
 */
const ID = 32;
const SESSION_ID = 64;

// Tenant boundary. One row today (the agency); multi-tenant later is just
// allowing more orgs + a signup flow. Every top-level entity is scoped by orgId.
export const organizations = mysqlTable("organizations", {
  id: varchar("id", { length: ID }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 191 }).notNull().unique(),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export const users = mysqlTable("users", {
  id: varchar("id", { length: ID }).primaryKey(),
  // Nullable only so pre-org rows can exist before bootstrap backfills them;
  // every live user belongs to exactly one org in v0.
  orgId: varchar("org_id", { length: ID }).references(() => organizations.id, {
    onDelete: "cascade",
  }),
  email: varchar("email", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lastNotificationsReadAt: timestampMs("last_notifications_read_at"),
  // Caller availability — self-set (and admin-overridable) presence shown to the
  // team. Defaults to offline; set to 'available' on login, 'offline' on logout.
  presence: varchar("presence", {
    length: 16,
    enum: ["available", "busy", "on_call", "offline"],
  })
    .notNull()
    .default("offline"),
  presenceUpdatedAt: timestampMs("presence_updated_at"),
  // Last time this user opened the team chat — drives the unread-message badge.
  lastChatReadAt: timestampMs("last_chat_read_at"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

// Stackable roles: a user can hold several rows (e.g. admin AND
// telecaller). Permissions derive from the set, not a single column.
export const userRoles = mysqlTable("user_roles", {
  id: varchar("id", { length: ID }).primaryKey(),
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", {
    length: 32,
    enum: ["admin", "telecaller", "site_agent", "operation_manager"],
  }).notNull(),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: SESSION_ID }).primaryKey(),
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestampMs("expires_at").notNull(),
});

// Shared to-do list. `userId` is the ASSIGNEE (whose list it shows on);
// `creatorUserId` is who created/assigned it. Self-created to-dos have the two
// equal. Either party may complete/edit it.
export const todos = mysqlTable("todos", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID }).references(() => organizations.id, {
    onDelete: "cascade",
  }),
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Who assigned it. Null only for legacy rows before this column existed
  // (backfilled to userId in bootstrap-time migration). SET NULL if that
  // account is removed — the to-do stays on the assignee's list.
  creatorUserId: varchar("creator_user_id", { length: ID }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  title: varchar("title", { length: 500 }).notNull(),
  notes: text("notes").notNull().$defaultFn(() => ""),
  done: boolean("done").notNull().default(false),
  priority: varchar("priority", {
    length: 16,
    enum: ["low", "normal", "high", "urgent"],
  })
    .notNull()
    .default("normal"),
  dueDate: timestampMs("due_date"),
  remindAt: timestampMs("remind_at"),
  // JSON array of { url, name } — files attached to the to-do.
  attachments: text("attachments").notNull().$defaultFn(() => "[]"),
  sortOrder: double("sort_order"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
  completedAt: timestampMs("completed_at"),
});

// In-app notifications for members (the Inbox): to-do + lead assignment, the
// daily follow-up digest, etc.
export const notifications = mysqlTable("notifications", {
  id: varchar("id", { length: ID }).primaryKey(),
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orgId: varchar("org_id", { length: ID }),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 500 }),
  actorName: varchar("actor_name", { length: 255 }),
  readAt: timestampMs("read_at"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export type Notification = typeof notifications.$inferSelect;

// Chat — both the org-wide team room AND 1:1 direct messages live here.
//  • recipientUserId NULL  → team room (everyone in the org sees it)
//  • recipientUserId set   → a direct message between userId (sender) and it
// Sender name is denormalised so a deleted account's messages still read (userId
// SET NULL). A DM is removed if either participant is deleted (recipient CASCADE).
export const chatMessages = mysqlTable("chat_messages", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: ID }).references(() => users.id, {
    onDelete: "set null",
  }),
  recipientUserId: varchar("recipient_user_id", { length: ID }).references(
    () => users.id,
    { onDelete: "cascade" },
  ),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  body: text("body").notNull().$defaultFn(() => ""),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// Per-conversation read pointers for direct messages. (The team room uses
// users.lastChatReadAt instead.) PK (user_id, peer_user_id) defined in the boot
// migration; one row per (reader, the person they're talking to).
export const dmReads = mysqlTable("dm_reads", {
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  peerUserId: varchar("peer_user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestampMs("last_read_at").notNull().$defaultFn(() => new Date()),
});

// Sales leads (the CRM core) — potential clients a telecaller nurtures through a
// pipeline. Org-scoped, owned/assigned to a staff member.
export const leads = mysqlTable("leads", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: varchar("created_by_user_id", { length: ID }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  // The staff member responsible for this lead (the assigned owner). SET NULL so
  // removing an account leaves the lead un-owned rather than deleting it.
  ownerUserId: varchar("owner_user_id", { length: ID }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 191 }),
  phone: varchar("phone", { length: 32 }),
  source: varchar("source", { length: 128 }),
  // What the client wants (type of work).
  purpose: varchar("purpose", { length: 255 }),
  // Legacy keyword stage (new/contacted/…). Superseded by stageId; kept so old
  // rows stay valid and the bootstrap backfill can map them to a stage row.
  stage: varchar("stage", { length: 64 }).notNull().default("new"),
  // The pipeline stage this lead sits in — a per-org lead_stages row, so a lead
  // manager can add their own stages. SET NULL if a stage is deleted (the board
  // then buckets it into the first stage until reassigned).
  stageId: varchar("stage_id", { length: ID }).references(() => leadStages.id, {
    onDelete: "set null",
  }),
  // Estimated deal value in whole rupees (nullable). Kept simple — no currency.
  estimatedValue: int("estimated_value"),
  // Next follow-up date. Drives the "Needs attention" view + overdue badges.
  followUpAt: timestampMs("follow_up_at"),
  // Postal address, broken into parts. `address` holds the street/area line.
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  pincode: varchar("pincode", { length: 16 }),
  country: varchar("country", { length: 128 }),
  notes: text("notes").notNull().$defaultFn(() => ""),
  // The pipeline this lead is currently being worked in — i.e. whose queue it
  // sits in. `stageId` must always be a stage belonging to this pipeline.
  pipelineId: varchar("pipeline_id", { length: ID }).references(
    () => pipelines.id,
    { onDelete: "set null" },
  ),
  // [PROTOTYPE] Per-pipeline journey/milestone data, JSON keyed by pipelineId:
  // { [pipelineId]: { done, by, at, fields: {key: value} } }. See lib/journey.ts.
  journey: text("journey").notNull().$defaultFn(() => "{}"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestampMs("updated_at").notNull().$defaultFn(() => new Date()),
});

export type Lead = typeof leads.$inferSelect;

// Pipelines — one per role, in the order a lead travels them (Telecalling →
// Site Visit → Operations). Each owns its own stages, so every role works a
// board built from its own vocabulary rather than a shared sales funnel.
// Per-org and user-definable, ordered by position.
export const pipelines = mysqlTable("pipelines", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6a89a8"),
  position: int("position").notNull().default(0),
  // Roles that work this pipeline, as a JSON array of role keys. Admins see
  // every pipeline regardless. Empty = nobody but admins.
  roles: text("roles").notNull().$defaultFn(() => "[]"),
  // The step form for this pipeline, as a JSON array of JourneyField. Lives on
  // the row (not keyed by name in code) so renaming a pipeline can't orphan it.
  fields: text("fields").notNull().$defaultFn(() => "[]"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type LeadPipelineHistory = typeof leadPipelineHistory.$inferSelect;

// Multiple staff can work one lead at once (e.g. a telecaller AND a field agent).
// One row per (lead, user); `isPrimary` marks the main responsible person.
// PK (lead_id, user_id) defined in the boot migration.
export const leadAssignees = mysqlTable("lead_assignees", {
  leadId: varchar("lead_id", { length: ID })
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: ID })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  addedByUserId: varchar("added_by_user_id", { length: ID }).references(
    () => users.id,
    { onDelete: "set null" },
  ),
  addedAt: timestampMs("added_at").notNull().$defaultFn(() => new Date()),
});

// Per-org, user-definable pipeline stages. Seeded with defaults in bootstrap
// (New/Contacted/Qualified/Won/Lost); a lead manager can add their own 'open'
// stages. `kind` keeps the won/lost semantics that drive the forecast math
// regardless of how stages are named. `position` orders the columns left → right.
export const leadStages = mysqlTable("lead_stages", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Which pipeline this stage belongs to. Each role has its own pipeline, so
  // "Won" means something different in each: for the telecaller it means handed
  // over to a site agent, not a sale.
  pipelineId: varchar("pipeline_id", { length: ID }).references(
    () => pipelines.id,
    { onDelete: "cascade" },
  ),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6a89a8"),
  kind: varchar("kind", { length: 16, enum: ["open", "won", "lost"] })
    .notNull()
    .default("open"),
  position: int("position").notNull().default(0),
  // Win probability 0–100 for the weighted forecast. Null → derived from kind.
  probability: int("probability"),
  // Reaching this stage completes the pipeline and hands the lead to the next
  // one. Only one per pipeline is meaningful.
  isExit: boolean("is_exit").notNull().default(false),
  // What to capture while a lead sits in this stage, as a JSON array of
  // JourneyField. Per stage rather than per pipeline: "when is the visit" only
  // makes sense at Visit scheduled, and asking it everywhere is noise.
  fields: text("fields").notNull().$defaultFn(() => "[]"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

/**
 * A lead's completed run through one pipeline. Written on handoff, so the
 * telecaller keeps seeing a lead as Won in *their* pipeline while the site
 * agent works it in theirs — a lead only has one current stage, so the finished
 * ones have to be recorded rather than inferred.
 */
export const leadPipelineHistory = mysqlTable("lead_pipeline_history", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  leadId: varchar("lead_id", { length: ID })
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  pipelineId: varchar("pipeline_id", { length: ID }).references(
    () => pipelines.id,
    { onDelete: "cascade" },
  ),
  /** The stage the lead left on — normally that pipeline's exit stage. */
  stageId: varchar("stage_id", { length: ID }).references(() => leadStages.id, {
    onDelete: "set null",
  }),
  byUserId: varchar("by_user_id", { length: ID }).references(() => users.id, {
    onDelete: "set null",
  }),
  completedAt: timestampMs("completed_at").notNull().$defaultFn(() => new Date()),
});

export type LeadStage = typeof leadStages.$inferSelect;

// CRM tags applied to leads (segmentation: Hot / Enterprise / Referral …).
export const leadTags = mysqlTable("lead_tags", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6a89a8"),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export const leadTagLinks = mysqlTable("lead_tag_links", {
  leadId: varchar("lead_id", { length: ID })
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id", { length: ID })
    .notNull()
    .references(() => leadTags.id, { onDelete: "cascade" }),
});

export type LeadTag = typeof leadTags.$inferSelect;

// Per-lead activity log: notes + logged calls/WhatsApp/meetings, plus auto-logged
// stage changes and ownership assignment. The backbone of the detail timeline.
export const leadActivities = mysqlTable("lead_activities", {
  id: varchar("id", { length: ID }).primaryKey(),
  orgId: varchar("org_id", { length: ID })
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  leadId: varchar("lead_id", { length: ID })
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  // Who did it (null if the account was later removed).
  userId: varchar("user_id", { length: ID }).references(() => users.id, {
    onDelete: "set null",
  }),
  actorName: varchar("actor_name", { length: 255 }).notNull(),
  kind: varchar("kind", {
    length: 32,
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
  outcome: varchar("outcome", { length: 64 }),
  // Note visibility: `public` is shared with the whole team (default); `private`
  // is a personal note visible only to its author.
  visibility: varchar("visibility", {
    length: 16,
    enum: ["public", "private"],
  })
    .notNull()
    .default("public"),
  body: text("body").notNull().$defaultFn(() => ""),
  createdAt: timestampMs("created_at").notNull().$defaultFn(() => new Date()),
});

export type LeadActivity = typeof leadActivities.$inferSelect;

// Tracks the last day the follow-up digest ran per org, so the daily nudge fires
// at most once per calendar day no matter how many times the app is opened.
export const digestState = mysqlTable("digest_state", {
  orgId: varchar("org_id", { length: ID })
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Local calendar day, "YYYY-MM-DD".
  lastRunDate: varchar("last_run_date", { length: 10 }),
});

export type Role = "admin" | "telecaller" | "site_agent" | "operation_manager";

export type Organization = typeof organizations.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type User = typeof users.$inferSelect;
