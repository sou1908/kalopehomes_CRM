import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listLeads, listLeadStages, tagsForLeads } from "@/lib/leads";
import { listDesks } from "@/lib/desks";
import {
  formatValue,
  summarize,
  followUpState,
  type DeskInfo,
  type LeadStageInfo,
  type LeadTagInfo,
} from "@/lib/leads-shared";
import { StageMenu } from "./_components/stage-menu";
import { DeskMeter } from "./_components/desk-meter";
import { Icon } from "@/app/_components/icons";

export default async function LeadsHomePage() {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  const orgId = user.orgId ?? "";
  const [leads, stages, desks] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
    orgId ? listDesks(orgId) : Promise.resolve([]),
  ]);
  const tagsByLead = await tagsForLeads(leads.map((l) => l.id));
  const stats = summarize(leads, stages);
  const now = Date.now();

  const byStage = new Map<string, typeof leads>();
  for (const s of stages) byStage.set(s.id, []);
  const fallbackId = stages[0]?.id;
  for (const lead of leads) {
    const key = lead.stageId && byStage.has(lead.stageId) ? lead.stageId : fallbackId;
    if (key) byStage.get(key)!.push(lead);
  }

  return (
    <div className="px-4 pb-6 pt-3 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Lead manager
          </div>
          <h1 className="font-display text-[34px] font-medium leading-none tracking-[-0.015em]">
            Pipeline
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
          {/* Portfolio figures. Mono + tabular so the columns align and a
              changing number never shifts the ones beside it. */}
          <div className="no-scrollbar flex max-w-full items-end gap-6 overflow-x-auto">
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
            {desks.length > 0
              ? desks.map((d) => d.name).join(" → ")
              : "handling desks"}{" "}
            desks as your team hands it on.
          </p>
        </div>
      ) : (
        <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const cards = byStage.get(stage.id) ?? [];
            const stageValue = cards.reduce(
              (sum, l) => sum + (l.estimatedValue ?? 0),
              0,
            );
            return (
              <section key={stage.id} className="flex w-72 shrink-0 flex-col">
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
                <div className="flex flex-col gap-2">
                  {cards.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stages={stages}
                      tags={tagsByLead.get(lead.id) ?? []}
                      desks={desks}
                      now={now}
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
  desks,
  now,
}: {
  lead: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    stageId: string | null;
    deskId: string | null;
    estimatedValue: number | null;
    followUpAt: Date | null;
  };
  stages: LeadStageInfo[];
  tags: LeadTagInfo[];
  desks: DeskInfo[];
  now: number;
}) {
  const value = formatValue(lead.estimatedValue);
  const fu = followUpState(lead.followUpAt, now);
  const due = fu === "overdue" || fu === "soon";
  const fuFmt =
    lead.followUpAt &&
    new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(
      lead.followUpAt,
    );

  return (
    // A due or overdue lead gets a coloured spine down its edge. Whoever is
    // working the board is looking for "who do I call today" first, and that
    // reads down a whole column without stopping on any single card.
    <div
      className={`card relative px-3 py-2.5 transition-colors hover:border-accent/40 ${
        due ? "border-l-2" : ""
      }`}
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
        <DeskMeter desks={desks} currentDeskId={lead.deskId} />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <StageMenu leadId={lead.id} value={lead.stageId} stages={stages} />
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
