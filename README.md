# Kalope Homes CRM

A standalone **leads CRM** for Kalope Homes — pipeline, custom stages, tags,
follow-ups, an activity log (calls/WhatsApp/notes/meetings), analytics, a
shared/assignable to-do list with an in-app Inbox, and a **Team room** (team chat
+ caller availability). Built on a base extracted from IssueTracker.

**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + SQLite (better-sqlite3 + Drizzle).

## Run

```bash
npm install --legacy-peer-deps
npm run dev      # http://localhost:3001
```

On first run it creates `./data/leadcrm.db` and a bootstrap admin from `.env.local`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Sign in, then create more accounts under
**Members** (admin only).

## Surfaces

- `/leads` — pipeline board (drag-free, inline stage menu), stats strip
- `/leads/all` — searchable/filterable table
- `/leads/[id]` — lead detail: editable details + structured address, purpose,
  tags (per-chip edit), activity log, follow-up reminder
- `/leads/stages` — user-definable pipeline stages (add/rename/recolor/reorder, win %)
- `/leads/analytics` — weighted forecast, value by stage, conversion by source
- `/leads/todos` — shared to-do list (Personal / Assigned to me / Assigned), assignable to members
- `/leads/inbox` — in-app notifications (e.g. when a to-do is assigned to you)
- `/leads/team` — **Team room**: team chat + availability roster (who's available / on call / busy)
- `/leads/team/dm/[userId]` — **Direct messages**: 1:1 chat with a teammate (conversations rail + unread badges)
  - In any chat you can **tag an ongoing lead** (＃ Tag lead) — it renders as a clickable chip linking to the lead
- `/dashboard/members` — admin: create login accounts + roles (Lead Manager / Telecaller)

## Roles

Three stackable staff roles (one person can hold several):

- **Lead Manager** — the owner/manager. Full access: the whole pipeline plus
  member, role, desk & team management. (Internally the `super_admin` role.)
- **Telecaller** — L1 callers who phone leads and log calls.
- **Field Agent** — L2, does site visits and logs them.

Everyone lands on `/leads` after login. The legacy `lead_manager` role was renamed
to `telecaller`; existing rows are migrated automatically on boot.

## Lead handling workflow

A stepwise handoff track, separate from the sales stages:

- **Desks** (`/leads/desks`) — Telecalling → Site Visit → Manager (configurable).
  A lead's desk shows who's working it; filter the list/sidebar by desk.
- **Multiple assignees** — several people can be on one lead at once (one primary).
  Assigning someone notifies them; "My leads" = leads you're assigned to.
- **Transfer / escalate** — move a lead to a desk and hand it to a person in one
  step (logged + notified), or escalate straight to the Lead Manager.
- **Public / private notes** — the activity composer has a 🔒 Private toggle;
  private notes are visible only to their author. Everything else is shared.

## Lead ownership & follow-ups

- Each lead has an **owner** (assign on the detail page). Assigning notifies the
  new owner in their Inbox. Filter to **My leads** from the sidebar / `?owner=me`.
- A **daily follow-up digest** nudges each owner (and admins, for unassigned
  leads) about overdue/due-today follow-ups via the Inbox. It runs lazily on app
  load (once per day) and via `GET /api/cron/follow-up-digest` (set `CRON_SECRET`
  to require a `?key=` / `x-cron-key`).

## What was removed vs IssueTracker

- Client change-request **issues**, the **team workspace** board, the **client
  magic-link portal**, **projects**, **Razorpay** payments, internal tasks,
  cycles, SLAs, views, and task labels — along with all their tables and lib code.
  This is now a lean, CRM-only codebase.

## Notes

- Runs on port **3001** so it can run alongside the original app (3000).
