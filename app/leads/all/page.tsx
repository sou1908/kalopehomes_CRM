import Link from "next/link";
import { requireRole } from "@/lib/auth";
import {
  listLeads,
  listLeadStages,
  listLeadTags,
  tagsForLeads,
  leadIdsWithTag,
} from "@/lib/leads";
import { listAssignableMembers } from "@/lib/members";
import { listPipelines } from "@/lib/pipelines";
import { assigneesForLeads } from "@/lib/assignees";
import { formatValue, followUpState } from "@/lib/leads-shared";
import { initials, colorFromName } from "@/lib/avatar";
import { StageMenu } from "../_components/stage-menu";
import { ColumnFilter } from "./_components/column-filter";

export default async function AllLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    tag?: string;
    q?: string;
    filter?: string;
    owner?: string;
    pipeline?: string;
    // Per-column filters (the funnel on each heading).
    name?: string;
    contact?: string;
    vmin?: string;
    vmax?: string;
    fu?: string;
  }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const orgId = user.orgId ?? "";
  const sp = await searchParams;
  const { stage, tag, q, filter, owner, pipeline } = sp;
  const query = (q ?? "").trim().toLowerCase();

  // Column filters
  const nameQ = (sp.name ?? "").trim().toLowerCase();
  const contactQ = (sp.contact ?? "").trim().toLowerCase();
  const vmin = sp.vmin && sp.vmin.trim() !== "" ? Number(sp.vmin) : null;
  const vmax = sp.vmax && sp.vmax.trim() !== "" ? Number(sp.vmax) : null;
  const fuFilter = sp.fu ?? null;

  // Every param, so a column filter's links keep the rest of the view intact.
  const allParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) allParams[k] = String(v);
  const attention = filter === "attention";
  // owner=me → my leads; owner=<id> → that member's leads.
  const ownerId = owner === "me" ? user.id : owner || null;

  const [all, stages, allTags, members, pipelines] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
    orgId ? listLeadTags(orgId) : Promise.resolve([]),
    orgId ? listAssignableMembers(orgId) : Promise.resolve([]),
    orgId ? listPipelines(orgId) : Promise.resolve([]),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const pipelineById = new Map(pipelines.map((d) => [d.id, d]));
  const assigneeMap = await assigneesForLeads(all.map((l) => l.id));
  const isAssigned = (leadId: string, uid: string) =>
    (assigneeMap.get(leadId) ?? []).some((a) => a.userId === uid);
  const activeStage = stages.find((s) => s.id === stage) ?? null;
  const activeTag = allTags.find((t) => t.id === tag) ?? null;
  const activePipeline = pipelines.find((d) => d.id === pipeline) ?? null;
  const openStageIds = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id));
  const tagged = activeTag ? await leadIdsWithTag(activeTag.id) : null;
  const now = Date.now();

  let leads = all;
  if (ownerId) leads = leads.filter((l) => isAssigned(l.id, ownerId));
  if (activePipeline) leads = leads.filter((l) => l.pipelineId === activePipeline.id);
  if (activeStage) leads = leads.filter((l) => l.stageId === activeStage.id);
  if (tagged) leads = leads.filter((l) => tagged.has(l.id));
  if (attention)
    leads = leads.filter((l) => {
      if (!l.stageId || !openStageIds.has(l.stageId)) return false;
      const fu = followUpState(l.followUpAt, now);
      return fu === "overdue" || fu === "soon";
    });
  if (query)
    leads = leads.filter((l) =>
      [l.name, l.company, l.email, l.phone, l.source]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(query)),
    );

  // ── Column filters ───────────────────────────────────────────────────────
  if (nameQ)
    leads = leads.filter((l) =>
      [l.name, l.company].filter(Boolean).some((v) => v!.toLowerCase().includes(nameQ)),
    );
  if (contactQ)
    leads = leads.filter((l) =>
      [l.email, l.phone].filter(Boolean).some((v) => v!.toLowerCase().includes(contactQ)),
    );
  if (vmin != null && Number.isFinite(vmin))
    leads = leads.filter((l) => l.estimatedValue != null && l.estimatedValue >= vmin);
  if (vmax != null && Number.isFinite(vmax))
    leads = leads.filter((l) => l.estimatedValue != null && l.estimatedValue <= vmax);
  if (fuFilter)
    leads = leads.filter((l) => {
      const state = followUpState(l.followUpAt, now);
      if (fuFilter === "overdue") return state === "overdue";
      if (fuFilter === "soon") return state === "soon";
      if (fuFilter === "set") return l.followUpAt != null;
      if (fuFilter === "none") return l.followUpAt == null;
      return true;
    });

  const tagsByLead = await tagsForLeads(leads.map((l) => l.id));
  const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            Lead manager
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {attention
              ? "Needs attention"
              : ownerId
                ? owner === "me"
                  ? "My leads"
                  : `${memberName.get(ownerId) ?? "Member"}’s leads`
                : "All leads"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/leads"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-text"
          >
            ◫ Board view
          </Link>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="mb-3 flex gap-2">
        {activeStage && <input type="hidden" name="stage" value={activeStage.id} />}
        {activeTag && <input type="hidden" name="tag" value={activeTag.id} />}
        {attention && <input type="hidden" name="filter" value="attention" />}
        {owner && <input type="hidden" name="owner" value={owner} />}
        {activePipeline && <input type="hidden" name="pipeline" value={activePipeline.id} />}
        {/* Keep the column funnels applied when searching. */}
        {sp.name && <input type="hidden" name="name" value={sp.name} />}
        {sp.contact && <input type="hidden" name="contact" value={sp.contact} />}
        {sp.vmin && <input type="hidden" name="vmin" value={sp.vmin} />}
        {sp.vmax && <input type="hidden" name="vmax" value={sp.vmax} />}
        {sp.fu && <input type="hidden" name="fu" value={sp.fu} />}
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, company, email, phone, source…"
          className="input max-w-md text-sm"
        />
        <button type="submit" className="btn-secondary text-xs">Search</button>
        {(query ||
          activeStage ||
          activeTag ||
          attention ||
          ownerId ||
          activePipeline ||
          nameQ ||
          contactQ ||
          vmin != null ||
          vmax != null ||
          fuFilter) && (
          <Link href="/leads/all" className="btn-ghost whitespace-nowrap text-xs">
            Clear
          </Link>
        )}
      </form>

      {/* Stage + attention filter chips */}
      <div className="mb-2 flex flex-wrap gap-2">
        <FilterChip href={withQ("/leads/all", q)} label="All" active={!activeStage && !attention && !activeTag && !ownerId} count={all.length} />
        <FilterChip
          href={withQ("/leads/all?owner=me", q)}
          label="👤 My leads"
          active={owner === "me"}
          count={all.filter((l) => isAssigned(l.id, user.id)).length}
        />
        <FilterChip
          href={withQ("/leads/all?filter=attention", q)}
          label="⏰ Needs attention"
          active={attention}
          count={all.filter((l) => {
            if (!l.stageId || !openStageIds.has(l.stageId)) return false;
            const fu = followUpState(l.followUpAt, now);
            return fu === "overdue" || fu === "soon";
          }).length}
        />
        {stages.map((s) => (
          <FilterChip
            key={s.id}
            href={withQ(`/leads/all?stage=${s.id}`, q)}
            label={s.name}
            active={activeStage?.id === s.id}
            count={all.filter((l) => l.stageId === s.id).length}
            color={s.color}
          />
        ))}
      </div>

      {/* Pipeline filter chips */}
      {pipelines.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">Pipeline</span>
          {pipelines.map((d) => (
            <FilterChip
              key={d.id}
              href={withQ(`/leads/all?pipeline=${d.id}`, q)}
              label={d.name}
              active={activePipeline?.id === d.id}
              count={all.filter((l) => l.pipelineId === d.id).length}
              color={d.color}
            />
          ))}
        </div>
      )}

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">Tags</span>
          {allTags.map((t) => (
            <FilterChip
              key={t.id}
              href={withQ(`/leads/all?tag=${t.id}`, q)}
              label={t.name}
              active={activeTag?.id === t.id}
              count={all.length}
              color={t.color}
              hideCount
            />
          ))}
        </div>
      )}

      {leads.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-muted">
          No leads match this view.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Name
                      <ColumnFilter
                        kind="text"
                        label="Name"
                        param="name"
                        placeholder="Name or company…"
                        params={allParams}
                      />
                    </span>
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      Contact
                      <ColumnFilter
                        kind="text"
                        label="Contact"
                        param="contact"
                        placeholder="Email or phone…"
                        params={allParams}
                      />
                    </span>
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      Assignees
                      <ColumnFilter
                        kind="choice"
                        label="Assignee"
                        param="owner"
                        params={allParams}
                        options={[
                          { value: "me", label: "Me" },
                          ...members
                            .filter((m) => m.id !== user.id)
                            .map((m) => ({
                              value: m.id,
                              label: m.name,
                              count: all.filter((l) => isAssigned(l.id, m.id)).length,
                            })),
                        ]}
                      />
                    </span>
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      Pipeline
                      <ColumnFilter
                        kind="choice"
                        label="Pipeline"
                        param="pipeline"
                        params={allParams}
                        options={pipelines.map((d) => ({
                          value: d.id,
                          label: d.name,
                          color: d.color,
                          count: all.filter((l) => l.pipelineId === d.id).length,
                        }))}
                      />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Value
                      <ColumnFilter
                        kind="range"
                        label="Value"
                        minParam="vmin"
                        maxParam="vmax"
                        unit="₹"
                        params={allParams}
                      />
                    </span>
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      Follow-up
                      <ColumnFilter
                        kind="preset"
                        label="Follow-up"
                        param="fu"
                        params={allParams}
                        options={[
                          {
                            value: "overdue",
                            label: "Overdue",
                            count: all.filter(
                              (l) => followUpState(l.followUpAt, now) === "overdue",
                            ).length,
                          },
                          {
                            value: "soon",
                            label: "Due soon",
                            count: all.filter(
                              (l) => followUpState(l.followUpAt, now) === "soon",
                            ).length,
                          },
                          {
                            value: "set",
                            label: "Has a date",
                            count: all.filter((l) => l.followUpAt != null).length,
                          },
                          {
                            value: "none",
                            label: "No date set",
                            count: all.filter((l) => l.followUpAt == null).length,
                          },
                        ]}
                      />
                    </span>
                  </th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Stage
                      <ColumnFilter
                        kind="choice"
                        label="Stage"
                        param="stage"
                        align="end"
                        params={allParams}
                        options={stages.map((s) => ({
                          value: s.id,
                          label: s.name,
                          color: s.color,
                          count: all.filter((l) => l.stageId === s.id).length,
                        }))}
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => {
                  const fu = followUpState(lead.followUpAt, now);
                  const tags = tagsByLead.get(lead.id) ?? [];
                  return (
                    <tr key={lead.id} className="hover:bg-panel/50">
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium hover:text-accentInk">
                          {lead.name}
                        </Link>
                        <div className="text-[11px] text-muted">{lead.company ?? ""}</div>
                        {tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px]"
                              >
                                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">
                        {lead.email || lead.phone || "—"}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {(() => {
                          const people = assigneeMap.get(lead.id) ?? [];
                          if (people.length === 0)
                            return <span className="text-muted">—</span>;
                          return (
                            <span className="flex items-center -space-x-1.5">
                              {people.slice(0, 4).map((a) => (
                                <span
                                  key={a.userId}
                                  title={a.name + (a.isPrimary ? " (primary)" : "")}
                                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-bg ${
                                    a.isPrimary ? "ring-accent/60" : ""
                                  }`}
                                  style={{ backgroundColor: colorFromName(a.userId) }}
                                >
                                  {initials(a.name)}
                                </span>
                              ))}
                              {people.length > 4 && (
                                <span className="pl-2.5 text-[11px] text-muted">
                                  +{people.length - 4}
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {lead.pipelineId && pipelineById.has(lead.pipelineId) ? (
                          <span className="inline-flex items-center gap-1.5 text-muted">
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: pipelineById.get(lead.pipelineId)!.color }}
                            />
                            {pipelineById.get(lead.pipelineId)!.name}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted">
                        {formatValue(lead.estimatedValue) ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {lead.followUpAt ? (
                          <span
                            className={
                              fu === "overdue"
                                ? "text-danger"
                                : fu === "soon"
                                  ? "text-marigold"
                                  : "text-muted"
                            }
                          >
                            {dateFmt.format(lead.followUpAt)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StageMenu
                          leadId={lead.id}
                          value={lead.stageId}
                          stages={
                            lead.pipelineId
                              ? stages.filter((st) => st.pipelineId === lead.pipelineId)
                              : stages
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


/** Preserve the search term when switching filter chips. */
function withQ(href: string, q?: string): string {
  if (!q) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}q=${encodeURIComponent(q)}`;
}

function FilterChip({
  href,
  label,
  active,
  count,
  color,
  hideCount,
}: {
  href: string;
  label: string;
  active: boolean;
  count: number;
  color?: string;
  hideCount?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-accent/50 bg-accent/10 text-text"
          : "border-border text-muted hover:text-text"
      }`}
    >
      {color && <span className="text-[10px]" style={{ color }}>●</span>}
      {label}
      {!hideCount && <span className="text-muted">{count}</span>}
    </Link>
  );
}
