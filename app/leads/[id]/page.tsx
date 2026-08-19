import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import type { LeadActivity } from "@/lib/db/schema";
import {
  getLead,
  listLeadStages,
  listActivities,
  listLeadTags,
  tagsForLead,
} from "@/lib/leads";
import {
  formatValue,
  followUpState,
  formatFollowUp,
  parseJourney,
  telHref,
} from "@/lib/leads-shared";
import { listAssignableMembers } from "@/lib/members";
import {
  listPipelines,
  canWorkPipeline,
  pipelineHistoryForLead,
} from "@/lib/pipelines";
import { canWorkLead } from "@/lib/access";
import { nextPipeline } from "@/lib/journey";
import { listLeadAssignees } from "@/lib/assignees";
import { initials, colorFromName } from "@/lib/avatar";
import { StageMenu } from "../_components/stage-menu";
import { AssigneesEditor } from "../_components/assignees-editor";
import { TransferPanel } from "../_components/transfer-panel";
import { LeadDetails } from "../_components/lead-edit-form";
import { LeadTagEditor } from "../_components/lead-tag-editor";
import { ActivityComposer } from "../_components/activity-composer";
import { ActivityItem } from "../_components/activity-item";
import { JourneyStepper } from "../_components/journey-stepper";
import { JourneyRibbon } from "../_components/journey-ribbon";
import { Icon } from "@/app/_components/icons";
import { UndoTransfer } from "../_components/undo-transfer";
import { FollowUpPicker } from "../_components/follow-up-picker";
import { RailTabs } from "../_components/rail-tabs";
import { deleteLeadAction, setFollowUpAction } from "../actions";

/** Date → yyyy-mm-ddThh:mm for <input type="datetime-local">; "" when unset. */
function toDateInput(d: Date | null): string {
  if (!d) return "";
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

const DT_FMT = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const { id } = await params;
  const orgId = user.orgId ?? "";

  const [lead, allStages, allTags, members, pipelines] = await Promise.all([
    getLead(id, orgId),
    listLeadStages(orgId),
    listLeadTags(orgId),
    listAssignableMembers(orgId),
    listPipelines(orgId),
  ]);
  if (!lead) notFound();
  // A lead can only move within its own pipeline, so that's all we offer.
  const stages = lead.pipelineId
    ? allStages.filter((s) => s.pipelineId === lead.pipelineId)
    : allStages;
  const currentStage = stages.find((s) => s.id === lead.stageId) ?? null;

  const [activities, leadTags, assignees] = await Promise.all([
    listActivities(lead.id, user.id),
    tagsForLead(lead.id),
    listLeadAssignees(lead.id),
  ]);
  const fu = followUpState(lead.followUpAt, Date.now());
  const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

  const stageColor = currentStage?.color ?? "#6a89a8";
  const isAdmin = user.roles.includes("admin");
  // You can open any lead, but only act on one sitting in a pipeline you work.
  const canWork = await canWorkLead(lead.id, orgId, user.roles);
  const leadPipeline = pipelines.find((p) => p.id === lead.pipelineId) ?? null;
  // Pipelines this lead has finished and left. A transfer can move a lead on
  // without its step ever being marked done, so this is what stops an earlier
  // pipeline reading "Pending" for a lead that is plainly past it.
  const history = await pipelineHistoryForLead(lead.id);
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const passed = Object.fromEntries(
    Object.entries(history).map(([pipelineId, h]) => [
      pipelineId,
      {
        by: h.byUserId ? (memberById.get(h.byUserId) ?? null) : null,
        at: h.at.getTime(),
      },
    ]),
  );

  // The pipeline this lead most recently left. Whoever works it may undo the
  // transfer — they can't otherwise touch the lead once it has moved on.
  const cameFrom = (() => {
    const entries = Object.entries(history)
      .filter(([pid]) => pid !== lead.pipelineId)
      .sort((a, b) => b[1].at.getTime() - a[1].at.getTime());
    const id = entries[0]?.[0];
    return id ? (pipelines.find((p) => p.id === id) ?? null) : null;
  })();
  const canUndo =
    cameFrom != null && canWorkPipeline(cameFrom, user.roles) && !canWork;

  // Named only so a completed step can point at where the lead goes next.
  const handoffTo = lead.pipelineId
    ? await nextPipeline(orgId, lead.pipelineId)
    : null;
  const workable = pipelines.filter((p) => canWorkPipeline(p, user.roles));
  const workableIds = workable.map((p) => p.id);
  // Every step's answers, readable by anyone working the lead: a site agent
  // heading out needs the telecaller's notes. Role scoping applies to EDITING
  // (workableIds below), not to reading what an earlier team recorded.
  const fullJourney = parseJourney(lead.journey);
  const journey = fullJourney;
  // Completed milestones, oldest → newest, for the journey timeline.
  const journeySteps = pipelines
    .filter((d) => fullJourney[d.id]?.done || history[d.id])
    .map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      by: fullJourney[d.id]?.by ?? passed[d.id]?.by ?? null,
      at: fullJourney[d.id]?.at ?? passed[d.id]?.at ?? null,
    }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-8 lg:h-screen lg:overflow-hidden">
      {/* Back link */}
      <div className="shrink-0 pt-6">
        <Link
          href="/leads"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
        >
          ‹ Back to pipeline
        </Link>
      </div>

      {/* Header — full width: identity (left) + Stage (right) */}
      <header className="mt-4 flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-black shadow-lg"
            style={{ background: colorFromName(lead.name) }}
            aria-hidden
          >
            {initials(lead.name)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <span>Lead</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1" style={{ color: stageColor }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: stageColor }} />
                {currentStage?.name ?? "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-2xl font-medium leading-tight tracking-tight sm:text-[2rem]">
                {lead.name}
              </h1>
              {telHref(lead.phone) && (
                // Icon only, and sat beside the name: calling this person is
                // the page's main action, and the number itself is a click away
                // under View details.
                <a
                  href={telHref(lead.phone)!}
                  title={`Call ${lead.name} — ${lead.phone}`}
                  aria-label={`Call ${lead.name} on ${lead.phone}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-accentInk transition-colors hover:border-accent/50 hover:bg-elevated"
                >
                  <Icon name="phone" size={15} />
                </a>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
              <span>{lead.company || "No company"}</span>
              {formatValue(lead.estimatedValue) && (
                <>
                  <span aria-hidden className="text-border">|</span>
                  <span className="font-mono text-text">{formatValue(lead.estimatedValue)}</span>
                  <span>estimated</span>
                </>
              )}
            </div>
            {(lead.followUpAt || leadTags.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {lead.followUpAt && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${
                      fu === "overdue"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : fu === "soon"
                          ? "border-marigold/40 bg-marigold/10 text-marigold"
                          : "border-border text-muted"
                    }`}
                  >
                    ⏰ {fu === "overdue" ? "Overdue" : "Follow up"} ·{" "}
                    {formatFollowUp(lead.followUpAt)}
                  </span>
                )}
                {leadTags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Details open as popups — see LeadDetails. */}
        <div className="shrink-0 self-center">
          <LeadDetails lead={lead} />
        </div>

        {/* Stage lives up here in the header */}
        <label className="block w-full shrink-0 sm:w-48">
          <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Stage
          </span>
          {canWork ? (
            <StageMenu
              leadId={lead.id}
              value={lead.stageId}
              stages={stages}
              className="w-full rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
            />
          ) : (
            <div className="w-full rounded-md border border-border bg-panel/50 px-2.5 py-1.5 text-sm text-muted">
              {currentStage?.name ?? "—"}
            </div>
          )}
        </label>

        <div className="mt-1 w-full border-t border-border pt-4">
          <JourneyRibbon
            pipelines={pipelines}
            currentPipelineId={lead.pipelineId}
            journey={fullJourney}
            passed={passed}
          />
        </div>
      </header>

      {!canWork && (
        <p className="mt-4 rounded-md border border-marigold/40 bg-marigold/10 px-3 py-2 text-xs text-marigold">
          This lead is with the {leadPipeline?.name ?? "another"} team. You can read
          it, but changes are theirs to make.
        </p>
      )}

      {/* Columns — Activity · Assigned/Transfer begin on the same line */}
      <div className="flex flex-col gap-6 pb-6 pt-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        {/* Activity first — the call is logged as it happens, and the journey
            step is filled from it afterwards. */}
        <section className="no-scrollbar min-w-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          <SectionLabel>Activity</SectionLabel>
          {canWork && <ActivityComposer leadId={lead.id} />}
          <div className="mt-3">
            <RailTabs
              tabs={[
                {
                  id: "recent",
                  label: "Recent",
                  content: (
                    <div className="card p-4">
                      <CompactList
                        items={activities.slice(0, 3)}
                        leadId={lead.id}
                        meId={user.id}
                        isAdmin={isAdmin}
                      />
                      {activities.length > 3 && (
                        <p className="mt-3 border-t border-border pt-3 text-center text-[11px] text-muted">
                          +{activities.length - 3} more — see Timeline
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  id: "timeline",
                  label: `Timeline · ${activities.length}`,
                  content: (
                    <div className="card p-4">
                      <TimelineList
                        items={activities}
                        leadId={lead.id}
                        meId={user.id}
                        isAdmin={isAdmin}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>

          <div className="mt-7">
            <SectionLabel>Journey</SectionLabel>
            <div className="card p-4">
              <JourneyStepper
                leadId={lead.id}
                pipelines={pipelines}
                currentPipelineId={lead.pipelineId}
                journey={journey}
                workablePipelineIds={workableIds}
                nextPipelineName={handoffTo?.name ?? null}
                passed={passed}
              />
            </div>

            {journeySteps.length > 0 && (
              <div className="card mt-3 p-4">
                <SectionLabel>Completed</SectionLabel>
                <ol className="space-y-4 border-l border-border pl-6">
                  {journeySteps.map((s) => (
                    <li key={s.id} className="relative">
                      <span
                        className="absolute -left-[30px] top-0.5 h-3 w-3 rounded-full ring-4 ring-panel"
                        style={{ background: s.color }}
                        aria-hidden
                      />
                      <div className="text-xs text-muted">
                        <span className="font-medium text-text">{s.name}</span>{" "}
                        completed{s.by ? ` · ${s.by}` : ""}
                        {s.at ? (
                          <>
                            <span className="mx-1" aria-hidden>·</span>
                            <span className="font-mono text-[10px]">
                              {DT_FMT.format(s.at)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* Right rail — Assigned/Transfer + Follow-up/Tags */}
        <aside className="no-scrollbar w-full shrink-0 space-y-4 lg:w-80 lg:min-h-0 lg:overflow-y-auto">
          {/* Transfer / Assigned — handing the lead on is the more frequent
              action, so it leads and opens by default. */}
          {canWork ? (
          <div className="card p-4">
            <RailTabs
              tabs={[
                {
                  id: "transfer",
                  label: "Transfer",
                  content: (
                    <TransferPanel
                      leadId={lead.id}
                      currentPipelineId={lead.pipelineId}
                      pipelines={pipelines}
                      members={members}
                    />
                  ),
                },
                {
                  id: "assigned",
                  label: `Assigned${assignees.length ? ` · ${assignees.length}` : ""}`,
                  content: (
                    <AssigneesEditor
                      leadId={lead.id}
                      assignees={assignees}
                      members={members}
                    />
                  ),
                },
              ]}
            />
          </div>
          ) : (
            <div className="card p-4">
              <SectionLabel>Assigned</SectionLabel>
              {assignees.length === 0 ? (
                <p className="text-xs text-muted">No one assigned yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {assignees.map((a) => (
                    <li key={a.userId} className="text-muted">
                      {a.name}
                      {a.isPrimary && (
                        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-accentInk">
                          primary
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canUndo && cameFrom && (
            <div className="card p-4">
              <SectionLabel>Sent by mistake?</SectionLabel>
              <UndoTransfer leadId={lead.id} fromName={cameFrom.name} />
            </div>
          )}

          {/* Follow-up / Tags */}
          {canWork && (
          <div>
            <RailTabs
              initialId={fu === "overdue" ? "followup" : undefined}
              tabs={[
                {
                  id: "followup",
                  label: "Follow-up",
                  dot:
                    fu === "overdue"
                      ? "rgb(var(--c-danger))"
                      : fu === "soon"
                        ? "rgb(var(--c-marigold))"
                        : undefined,
                  content: (
                    <form action={setFollowUpAction} className="card space-y-3 p-4">
                      <input type="hidden" name="leadId" value={lead.id} />
                      <div>
                        <span className="label">Remind me on</span>
                        <FollowUpPicker defaultValue={toDateInput(lead.followUpAt)} />
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                          Leave the time on “All day” for a whole-day reminder.
                          Overdue &amp; due-soon leads surface in “Needs
                          attention”; clear the date to remove it.
                        </p>
                      </div>
                      <button type="submit" className="btn-primary w-full text-xs">
                        {lead.followUpAt ? "Update reminder" : "Set reminder"}
                      </button>
                    </form>
                  ),
                },
                {
                  id: "tags",
                  label: `Tags${leadTags.length ? ` · ${leadTags.length}` : ""}`,
                  content: (
                    <div className="card p-4">
                      <LeadTagEditor
                        leadId={lead.id}
                        allTags={allTags}
                        selectedIds={leadTags.map((t) => t.id)}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
          )}
        </aside>
      </div>

      {/* Footer: meta + subtle delete */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border py-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        <span>Added {dateFmt.format(lead.createdAt)}</span>
        {canWork && (
        <form action={deleteLeadAction}>
          <input type="hidden" name="leadId" value={lead.id} />
          <button type="submit" className="text-danger/70 hover:text-danger hover:underline">
            Delete lead
          </button>
        </form>
        )}
      </div>
    </div>
  );
}

/** Consistent eyebrow-style section heading. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="inline-block h-3 w-0.5 rounded-full bg-accent" />
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {children}
      </h2>
    </div>
  );
}

const EMPTY_ACTIVITY = (
  <p className="py-6 text-center text-xs text-muted">
    No activity yet. Log a call, email, or note above.
  </p>
);

type ListProps = {
  items: LeadActivity[];
  leadId: string;
  meId: string;
  isAdmin: boolean;
};

function toItem(a: LeadActivity) {
  return {
    id: a.id,
    kind: a.kind,
    actorName: a.actorName,
    body: a.body,
    outcome: a.outcome,
    visibility: a.visibility,
    dateLabel: DT_FMT.format(a.createdAt),
  };
}

/** Compact recent-activity list (used in the “Recent” tab). */
function CompactList({ items, leadId, meId, isAdmin }: ListProps) {
  if (items.length === 0) return EMPTY_ACTIVITY;
  return (
    <ol className="space-y-1">
      {items.map((a) => (
        <ActivityItem
          key={a.id}
          variant="compact"
          a={toItem(a)}
          leadId={leadId}
          canManage={isAdmin || a.userId === meId}
        />
      ))}
    </ol>
  );
}

/** Full vertical timeline with connector line (used in the “Timeline” tab). */
function TimelineList({ items, leadId, meId, isAdmin }: ListProps) {
  if (items.length === 0) return EMPTY_ACTIVITY;
  return (
    <ol className="space-y-5 border-l border-border pl-6">
      {items.map((a) => (
        <ActivityItem
          key={a.id}
          variant="timeline"
          a={toItem(a)}
          leadId={leadId}
          canManage={isAdmin || a.userId === meId}
        />
      ))}
    </ol>
  );
}
