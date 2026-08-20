import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listLeads, listLeadStages, tagsForLeads } from "@/lib/leads";
import {
  listPipelines,
  pipelinesForRoles,
  leadsHandedOnFrom,
} from "@/lib/pipelines";
import {
  formatValue,
  summarize,
  followUpState,
  formatFollowUp,
  type PipelineInfo,
  type LeadStageInfo,
  type LeadTagInfo,
} from "@/lib/leads-shared";
import { StageMenu } from "./_components/stage-menu";
import { PipelineMeter } from "./_components/pipeline-meter";
import { Icon } from "@/app/_components/icons";

export default async function LeadsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin", "operation_manager"]);
  const orgId = user.orgId ?? "";
  const { pipeline: wanted } = await searchParams;

  const [allLeads, allStages, allPipelines] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
    orgId ? listPipelines(orgId) : Promise.resolve([]),
  ]);

  // Each role works its own pipeline, so the board shows one at a time. You land
  // on yours; admins see all of them and can switch.
  const mine = pipelinesForRoles(allPipelines, user.roles);
  const visible = mine.length > 0 ? mine : allPipelines;
  const active = visible.find((p) => p.id === wanted) ?? visible[0] ?? null;

  const stages = active
    ? allStages.filter((s) => s.pipelineId === active.id)
    : [];
  const inPipeline = active
    ? allLeads.filter((l) => l.pipelineId === active.id)
    : [];

  // Leads this pipeline finished and passed on. They've left, so they no longer
  // match by pipeline_id — but they're this team's completed work, and dropping
  // them would make the board look like leads had vanished.
  const handedOnIds = active ? await leadsHandedOnFrom(orgId, active.id) : [];
  const handedOnSet = new Set(handedOnIds);
  const handedOn = allLeads.filter(
    (l) => handedOnSet.has(l.id) && l.pipelineId !== active?.id,
  );
  const leads = [...inPipeline, ...handedOn];
  const movedOn = new Set(handedOn.map((l) => l.id));

  const tagsByLead = await tagsForLeads(leads.map((l) => l.id));
  const stats = summarize(leads, stages);
  const now = Date.now();

  const byStage = new Map<string, typeof leads>();
  for (const s of stages) byStage.set(s.id, []);
  const exitStageId = stages.find((s) => s.isExit)?.id ?? null;
  const fallbackId = stages[0]?.id;
  for (const lead of leads) {
    // A lead that has moved on belongs in this pipeline's exit column — its
    // current stage now belongs to whichever pipeline holds it.
    const key = movedOn.has(lead.id)
      ? (exitStageId ?? fallbackId)
      : lead.stageId && byStage.has(lead.stageId)
        ? lead.stageId
        : fallbackId;
    if (key) byStage.get(key)!.push(lead);
  }

  return (
    // Capped to the window rather than growing with the tallest column, so the
    // board's horizontal scrollbar stays in view instead of sinking below a
    // full column — you shouldn't have to scroll down to scroll sideways.
    // Columns scroll their own cards instead. The 4rem is the utility strip.
    //
    // Only from lg up: on a phone the page scrolls normally, which is the
    // right behaviour when one column fills the screen anyway.
    <div className="flex flex-col px-4 pb-3 pt-3 sm:px-8 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Pipeline
          </div>
          <h1 className="font-display text-[34px] font-medium leading-none tracking-[-0.015em]">
            {active?.name ?? "No pipeline"}
          </h1>
          {visible.length > 1 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {visible.map((p) => (
                <Link
                  key={p.id}
                  href={`/leads?pipeline=${p.id}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    p.id === active?.id
                      ? "border-accent/50 text-text"
                      : "border-border text-muted hover:border-accent/50 hover:text-text"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          {/* Portfolio figures. Mono + tabular so the columns align and a
              changing number never shifts the ones beside it. */}
          <div className="no-scrollbar flex max-w-full items-end gap-5 overflow-x-auto sm:gap-6">
            <Stat label="Total" value={stats.total} />
            <Stat label="Open" value={stats.open} tone="text-marigold" />
            <Stat label="Won" value={stats.won} tone="text-success" />
            <Stat label="Lost" value={stats.lost} tone="text-clay" />
            <Stat
              label="Conversion"
              value={`${Math.round(stats.conversionRate * 100)}%`}
              tone="text-accentInk"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/leads/stages"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <Icon name="sliders" size={14} />
              Stages
            </Link>
            <Link
              href="/leads/all"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <Icon name="list" size={14} />
              List view
            </Link>
          </div>
        </div>
      </div>

      {leads.length === 0 ? (
        // An empty screen is an invitation to act — and it's the right place to
        // explain the two tracks a lead travels, since there's nothing else here.
        <div className="card mt-2 px-6 py-14 text-center">
          <h2 className="font-display text-xl font-medium">No leads yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
            Add your first one with <span className="text-accentInk">New lead</span>.
            Each lead moves across the pipeline as the conversation progresses, and
            along the{" "}
            {allPipelines.length > 0
              ? allPipelines.map((d) => d.name).join(" → ")
              : "handling"}{" "}
            pipelines as your team hands it on.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 lg:min-h-0 lg:flex-1">
          {/* The scrollbar stays visible here. Hiding it was fine at four
              columns; at seven the last ones sit off-screen with nothing to
              say they exist, and a board you cannot tell scrolls reads as a
              board that is missing stages. */}
          {stages.map((stage) => {
            const cards = byStage.get(stage.id) ?? [];
            const stageValue = cards.reduce(
              (sum, l) => sum + (l.estimatedValue ?? 0),
              0,
            );
            return (
              <section
                key={stage.id}
                className="flex w-[80vw] max-w-[18rem] shrink-0 flex-col sm:w-72 lg:min-h-0"
              >
                {/* Ruled column head: the stage's own colour carries the
                    identification, so no dot is needed beside the name. */}
                <div
                  className="h-[2px] w-full rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <div className="mb-3 mt-2.5 flex items-baseline gap-2">
                  <h2 className="font-display text-[15px] font-medium tracking-[-0.01em]">
                    {stage.name}
                  </h2>
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {cards.length}
                  </span>
                  {stageValue > 0 && (
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-muted">
                      {formatValue(stageValue)}
                    </span>
                  )}
                </div>
                {/* The cards scroll, not the board — that's what keeps the
                    horizontal bar pinned in view. */}
                <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {cards.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stages={stages}
                      tags={tagsByLead.get(lead.id) ?? []}
                      pipelines={allPipelines}
                      now={now}
                      movedOn={movedOn.has(lead.id)}
                    />
                  ))}
                  {cards.length === 0 && (
                    // An empty column is the normal state of a pipeline, not a
                    // problem — say so quietly instead of drawing a big box.
                    <p className="px-0.5 text-[11px] leading-relaxed text-muted/70">
                      Nothing in {stage.name.toLowerCase()}.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  // A zero carries no news — let it recede so the figures that matter lead.
  const isZero = value === 0 || value === "0%";
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <span
        className={`font-mono text-xl leading-none tabular-nums ${
          isZero ? "text-muted/60" : (tone ?? "text-text")
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function LeadCard({
  lead,
  stages,
  tags,
  pipelines,
  now,
  movedOn,
}: {
  lead: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    stageId: string | null;
    pipelineId: string | null;
    estimatedValue: number | null;
    followUpAt: Date | null;
  };
  stages: LeadStageInfo[];
  tags: LeadTagInfo[];
  pipelines: PipelineInfo[];
  now: number;
  /** Finished here and passed on — shown for the record, not as live work. */
  movedOn?: boolean;
}) {
  const value = formatValue(lead.estimatedValue);
  const fu = followUpState(lead.followUpAt, now);
  const due = fu === "overdue" || fu === "soon";
  const fuFmt = formatFollowUp(lead.followUpAt);

  return (
    // A due or overdue lead gets a coloured spine down its edge. Whoever is
    // working the board is looking for "who do I call today" first, and that
    // reads down a whole column without stopping on any single card.
    <div
      className={`card relative px-3 py-2.5 transition-colors hover:border-accent/40 ${
        due ? "border-l-2" : ""
      } ${movedOn ? "opacity-60" : ""}`}
      style={
        due
          ? {
              borderLeftColor:
                fu === "overdue" ? "rgb(var(--c-danger))" : "rgb(var(--c-marigold))",
            }
          : undefined
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          {lead.company ?? "No company"}
        </span>
        {value && (
          <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-text">
            {value}
          </span>
        )}
      </div>

      <Link
        href={`/leads/${lead.id}`}
        className="mt-1 block font-display text-[17px] font-medium leading-tight tracking-[-0.01em] transition-colors hover:text-accentInk"
      >
        {lead.name}
      </Link>
      {lead.email && (
        <div className="mt-0.5 truncate text-[11px] text-muted">{lead.email}</div>
      )}

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px]"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: t.color }}
              />
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5">
        <PipelineMeter pipelines={pipelines} currentPipelineId={lead.pipelineId} />
      </div>

      {movedOn && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-success">
          Handed on
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {!movedOn && (
          <StageMenu leadId={lead.id} value={lead.stageId} stages={stages} />
        )}
        {fuFmt && due && (
          <span
            className={`ml-auto inline-flex items-center gap-1 font-mono text-[10px] tabular-nums ${
              fu === "overdue" ? "text-danger" : "text-marigold"
            }`}
            title={fu === "overdue" ? "Follow-up overdue" : "Follow-up due soon"}
          >
            <Icon name="clock" size={11} />
            {fuFmt}
          </span>
        )}
      </div>
    </div>
  );
}
