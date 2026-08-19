# Kalope Homes CRM — Build Status & Handoff

_Last updated: 2026-06-08 · Standalone CRM extracted from IssueTracker, rebranded to Kalope Homes._

A self-contained **leads CRM** for Kalope Homes. It was forked from the larger
IssueTracker app by copying the whole project, then trimming everything that
wasn't CRM and rewiring what was left. Use this doc as the starting context for
any new session here.

> **2026-06-08 update:** Rebranded LeadCRM → **Kalope Homes CRM**. Roles
> restructured: the old `lead_manager` worker role was renamed to **Telecaller**;
> the top full-access role (`super_admin`) is now displayed as **Lead Manager**.
> Added a **Team room** (`/leads/team`): org-wide team chat + caller availability
> presence (self-set, Lead-Manager-overridable) + **1:1 direct messages**
> (`/leads/team/dm/[userId]`, conversations rail with per-chat unread badges).
> New tables: `chat_messages` (`recipient_user_id` NULL = team room, set = DM),
> `dm_reads`; new `users` columns: `presence`, `presence_updated_at`,
> `last_chat_read_at`. Chat messages can **tag ongoing leads** via a `[[lead:ID]]`
> token (picker in the composer → clickable chip on render; `listLeadMentions`
> in lib/leads.ts). Build verified green.

---

## Run it

```bash
npm install --legacy-peer-deps
npm run dev        # http://localhost:3001
```

- First run auto-creates `./data/leadcrm.db` and a bootstrap admin from `.env.local`
  (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). **Change `SESSION_SECRET` + admin password before real use.**
- Runs on **port 3001** (so it can run beside the original app on 3000).
- `npm run build` to verify; `npm run db:studio` to inspect the DB.

## Stack

Next.js 16 (App Router, RSC + server actions) · TypeScript · Tailwind 3 ·
SQLite (better-sqlite3 + Drizzle). Auth = hand-rolled bcrypt + session cookies.
DB auto-migrates on boot (`lib/db/index.ts` runs `CREATE TABLE IF NOT EXISTS` +
idempotent `ALTER`s — no migration files).

## Roles & access

Three stackable staff roles (all work the `/leads` surface):

- **Lead Manager** — full access incl. Members admin (`/dashboard/members`),
  desk/stage config, and setting any teammate's availability. Internally the
  `super_admin` role key — only the display label changed.
- **Telecaller** — L1 caller (phones leads, logs calls).
- **Field Agent** — L2 site visits (meets prospects, logs visits).

Everyone lands on `/leads` after login. (`team_member` / `client` still exist in
the schema enum but are unused here.)

## 🔁 Lead handling workflow (DONE 2026-06-08)

Stepwise handoff for the FB-lead flow (Telecalling → Site Visit → Manager),
**separate from the sales stages**:

- **Desks** (`desks` table, user-definable at `/leads/desks`; `leads.desk_id`) —
  the handling track. Seeded Telecalling / Site Visit / Manager. Inline desk
  menu on the detail + board chip + sidebar/table filter (`?desk=`). `lib/desks.ts`.
- **Multiple assignees** (`lead_assignees`, `lib/assignees.ts`) — several people
  can work one lead at once, one marked **primary**. Editor on the detail rail;
  avatars on the all-leads table; "My leads" = leads I'm assigned to. Adding
  someone notifies them. (Migrated the old single `owner_user_id` → primary
  assignee; the column remains only as the migration source.)
- **Transfer / escalate** (`lib/transfer.ts`) — one action moves a lead to a desk
  AND hands it to a person there (logs `transferred`, notifies). "Escalate to
  Lead Manager" jumps to the last desk + pings the Lead Manager(s).
- **Public / private notes** — the activity composer has a 🔒 Private toggle
  (`lead_activities.visibility`); private notes are author-only (`listActivities`
  takes the viewer id), never shared or transferred. Everything else is shared.

---

## ✅ What's done (features)

### Pipeline & leads
- **Pipeline board** (`/leads`) — kanban by stage, inline stage menu, compact stats strip (Total/Open/Won/Lost/Conversion).
- **All leads** (`/leads/all`) — table with search (name/company/email/phone/source), stage + tag filters, "Needs attention" filter.
- **Lead detail** (`/leads/[id]`) — fixed 3-column shell (Details · Activity · rail), each column scrolls independently; editorial styling (serif name, monogram, mono eyebrows).
  - **Details** edit-in-modal (collapsed read-only summary → spacious modal, auto-closes on save).
  - **Structured address** (street/area, city, state, PIN, country).
  - **Purpose** dropdown (type of work) + **Source** dropdown; both support "Other → please specify".
  - **Tags** — toggle to apply, **per-chip ✎ edit** (rename/recolor/delete), inline create.
  - **Activity log** — note / call / WhatsApp / meeting; calls have an **outcome** (Connected, Not connected, Declined, Switched off, Busy, Wrong number, Callback requested) + optional remark; auto-logs created/stage-change. Recent + Timeline tabs.
  - **Follow-up** reminder date (rail tab) → drives overdue/due-soon badges + "Needs attention".

### Stages (user-definable)
- Per-org `lead_stages` (name, hex color, kind open/won/lost, position, win %).
- **`/leads/stages`** — add / rename / recolor / reorder / delete (Won & Lost protected; can't delete a stage that holds leads).

### Analytics
- **`/leads/analytics`** — weighted forecast (open value × per-stage win %), value-by-stage bars, conversion by source.

### Shared to-dos (assignable)
- **`/leads/todos`** — personal + assignable to-dos. Sidebar sub-nav: **Personal / Assigned to me / Assigned**; page tabs **All / Today / Upcoming / Completed**.
- Assign to another member (scoped to lead_manager + super_admin); composer hidden on "Assigned to me"/"Completed" (act, don't create).
- Each to-do: title, notes, priority, due date, reminder, attachments (file/link).

### Inbox / notifications
- **`/leads/inbox`** — in-app notifications with unread badge in the sidebar.
- Fires when a **to-do is assigned/reassigned** to someone (links to their "Assigned to me").

### Admin
- **`/dashboard/members`** — create login accounts + assign roles (Lead Manager / Telecaller); guards last Lead Manager. (`/dashboard` redirects here.)

---

## 🔧 What was removed vs IssueTracker (by design)

- Client change-request **issues**, the **team workspace** board, the **client
  magic-link portal**, **projects**, **Razorpay** payments, internal **tasks**,
  **cycles**, **SLAs**, **views**, and task **labels**.
- **Convert to client** is gone entirely (no projects/clients/magic links). The
  `convertLeadToClient` path + `lib/clients.ts` were removed.

## 🧹 Schema/lib cleanup (DONE 2026-06-08)

Lean, CRM-only codebase now. **Deleted lib files:** `projects`, `workflow`,
`workflow-shared`, `tasks`, `assign`, `team`, `team-projects`, `labels`, `cycles`,
`views`, `slas`, `markdown`, `razorpay`, `clients`, `config`, `pdf/*`. **Removed
schema tables + boot DDL:** `projects`, `issues`, `attachments`, `events`,
`messages`, `payments`, `tasks`, `team_projects`, `cycles`, `sla_policies`,
`views`, `labels`, `task_labels`, `issue_labels`, `team_members` (+ their type
exports). Dropped the `leads.converted_*` columns and the members "Clients"
section. The file route (`app/api/files`) now infers mime from the extension
(no more `attachments` lookup). **Note:** existing DB files keep these tables on
disk (CREATE statements were removed, not DROPs) — harmless; a fresh DB is lean.

---

## ⚠️ Known notes / caveats

- **Fonts** load from Google Fonts (editorial theme: Newsreader / Source Serif 4 /
  JetBrains Mono) in `app/globals.css`.
- Single SQLite file = single point of failure (fine for dev/single user).

---

## 🔭 What to do next (suggested order)

_Done 2026-06-08: schema/lib cleanup · lead ownership + assignment · follow-up digest._

1. **Email notifications (Resend)** — pair with the in-app Inbox: new assignment,
   follow-up due, etc. Needs a Resend API key + verified domain.
2. **Per-lead contacts & richer CRM** — multiple contacts per company, deal
   stages history, won/lost reason capture, lead source analytics over time.
6. **Durability / pre-customer** — versioned backups, soft-delete + audit log,
   SQLite → managed Postgres (Neon/Supabase/Turso) before any real customer.
7. **Auth polish** — Google sign-in (bcrypt seam already there), password reset.
8. **Multi-tenant** — the `organizations` + `org_id` seam exists; allow org signup +
   billing if this becomes a product.

---

## Map of the code (CRM-relevant)

- `app/leads/**` — all CRM pages + `_components/` (board, detail, composer,
  edit form, tag editor, activity composer, rail-tabs, select-or-other, stage manager,
  sidebar) + `actions.ts` + `todos/` + `inbox/`
- `lib/leads.ts` — lead + stage + tag + activity CRUD (server)
- `lib/leads-shared.ts` — client-safe stage/tag metadata, helpers, `summarize`
- `lib/todos.ts` — shared to-dos (assignment, lists, counts)
- `lib/notifications.ts` — in-app notifications
- `lib/chat.ts` / `lib/presence.ts` (+ `*-shared`) — team room + DMs + availability
- `lib/digest.ts` — daily follow-up digest (lazy trigger + `/api/cron/follow-up-digest`)
- `app/leads/team/**` — Team room (chat, DMs, roster)
- `lib/auth.ts` / `lib/roles*.ts` / `lib/bootstrap.ts` / `lib/members.ts` — auth, roles, org/admin seed, member admin
- `lib/db/{schema,index}.ts` — Drizzle schema + boot migrations
- `app/dashboard/{layout,page,members}` — admin shell + members management
- `app/(auth)/login` — login
