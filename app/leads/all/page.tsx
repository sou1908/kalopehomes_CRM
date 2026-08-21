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
import { listPipelines, canWorkPipeline } from "@/lib/pipelines";
import { assigneesForLeads } from "@/lib/assignees";
import {
  formatValue,
  followUpState,
  formatFollowUp,
  telHref,
  whatsappHref,
  inDateRange,
} from "@/lib/leads-shared";
import { initials, colorFromName } from "@/lib/avatar";
import { StageMenu } from "../_components/stage-menu";
import { Icon } from "@/app/_components/icons";
// TEMPORARY — testing only, remove before launch.
import { DangerZone } from "../_components/danger-zone";
import { ColumnFilter } from "./_components/column-filter";
import { DateRangeFilter } from "../_components/date-range-filter";

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
    city?: string;
    vmin?: string;
    vmax?: string;
    fu?: string;
    // Added-between, from the header.
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const orgId = user.orgId ?? "";
  const sp = await searchParams;
  const { stage, tag, q, filter, owner, pipeline, from, to } = sp;
  const query = (q ?? "").trim().toLowerCase();

  // Column filters
  const nameQ = (sp.name ?? "").trim().toLowerCase();
  const cityQ = (sp.city ?? "").trim().toLowerCase();
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

  const [everyLead, allStages, allTags, members, allPipelines] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
    orgId ? listLeadTags(orgId) : Promise.resolve([]),
    orgId ? listAssignableMembers(orgId) : Promise.resolve([]),
    orgId ? listPipelines(orgId) : Promise.resolve([]),
  ]);

  // Role scoping: you see the pipelines you work, their stages, and the leads
  // sitting in them. Admins work every pipeline, so nothing is filtered for them.
  const pipelines = allPipelines.filter((p) => canWorkPipeline(p, user.roles));
  const pipelineIds = new Set(pipelines.map((p) => p.id));
  const stages = allStages.filter(
    (st) => !st.pipelineId || pipelineIds.has(st.pipelineId),
  );
  const all = everyLead.filter(
    (l) => !l.pipelineId || pipelineIds.has(l.pipelineId),
  );
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

  // Cities as they actually appear on leads, most-used first, so the filter can
  // never offer a place with nothing in it. Grouped case-insensitively but
  // labelled with the spelling first seen, since imported rows arrive as
  // "Patna", "patna" and "PATNA" and those are one city, not three.
  const cityOptions = (() => {
    const seen = new Map<string, { label: string; count: number }>();
    for (const l of all) {
      const name = (l.city ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const found = seen.get(key);
      if (found) found.count += 1;
      else seen.set(key, { label: name, count: 1 });
    }
    return [...seen.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
      .map(([key, v]) => ({ value: key, label: v.label, count: v.count }));
  })();

  let leads = all;
  if (ownerId) leads = leads.filter((l) => isAssigned(l.id, ownerId));
  if (activePipeline) leads = leads.filter((l) => l.pipelineId === activePipeline.id);
  // Matched case-insensitively for the same reason the options are grouped.
  if (cityQ) leads = leads.filter((l) => (l.city ?? "").trim().toLowerCase() === cityQ);
  // Added between two dates — the same filter the board header carries.
  if (from || to) leads = leads.filter((l) => inDateRange(l.createdAt, from, to));
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
      {/* Wraps, so on a narrow window the controls drop below the title
          instead of squeezing the date fields into unusable slivers. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
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
        {/* items-end, not items-center: the date filter is taller than a plain
            button because its fields carry labels, and centring against that
            floats everything beside it above the input line. */}
        <div className="flex items-end gap-2">
          {/* ⚠️ TEMPORARY — testing only. Remove this, the import above,
              app/leads/_components/danger-zone.tsx, deleteAllLeadsAction in
              app/leads/actions.ts, and lib/danger.ts before launch. */}
          {user.roles.includes("admin") && <DangerZone count={everyLead.length} />}
          {/* Board view lived here; the sidebar's "Pipeline" already goes
              there. This does something the list could not do at all. Carries
              every other filter, so narrowing by date keeps your stage, tag and
              search intact. */}
          <DateRangeFilter
            from={from}
            to={to}
            action="/leads/all"
            carry={Object.fromEntries(
              Object.entries(allParams).filter(([k]) => k !== "from" && k !== "to"),
            )}
          />
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
        <>
        {/* ── Phone: a list of cards ──
            A seven-column table at 375px is not a table. On a phone the job is
            narrower — find the person, call them, move them on — so each lead
            becomes a row with the number promoted to a real tap target. The
            table below takes over from md up. */}
        <ul className="card divide-y divide-border md:hidden">
          {leads.map((lead) => {
            const fu = followUpState(lead.followUpAt, now);
            const stage = stages.find((s) => s.id === lead.stageId) ?? null;
            const pipeline = lead.pipelineId ? pipelineById.get(lead.pipelineId) : null;
            const dial = telHref(lead.phone);
            const wa = whatsappHref(lead.phone);
            return (
              <li key={lead.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="block font-display text-[17px] leading-tight hover:text-accentInk"
                  >
                    {lead.name}
                  </Link>
                  {lead.company && (
                    <div className="mt-0.5 truncate text-[11px] text-muted">
                      {lead.company}
                    </div>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {stage && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"
                        style={{ color: stage.color }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </span>
                    )}
                    {pipeline && <span className="text-muted">{pipeline.name}</span>}
                    {lead.followUpAt && fu !== "later" && (
                      <span
                        className={`font-mono ${fu === "overdue" ? "text-danger" : "text-marigold"}`}
                      >
                        {formatFollowUp(lead.followUpAt)}
                      </span>
                    )}
                    {formatValue(lead.estimatedValue) && (
                      <span className="font-mono tabular-nums text-muted">
                        {formatValue(lead.estimatedValue)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 44px targets — this is the whole reason to open the CRM on a
                    phone. WhatsApp sits beside the dialler because on a handset
                    it is just as likely to be the thing you reach for. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {dial && (
                    <a
                      href={dial}
                      aria-label={`Call ${lead.name} on ${lead.phone}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-accentInk transition-colors active:bg-elevated"
                    >
                      <Icon name="phone" size={17} />
                    </a>
                  )}
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${lead.name} on ${lead.phone}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-success transition-colors active:bg-elevated"
                    >
                      <Icon name="whatsapp" size={17} />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="card hidden overflow-hidden md:block">
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
                  {/* City replaces the Pipeline column. Which pipeline a lead
                      sits in is already on the chips above and in its Stage;
                      where the work is was not shown anywhere. Built from the
                      cities actually present, so it can't list a place you have
                      no leads in. */}
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      City
                      <ColumnFilter
                        kind="choice"
                        label="City"
                        param="city"
                        params={allParams}
                        options={cityOptions}
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
                        {/* Dialable: a telecaller works this column all day, and
                            copying a number out to a phone is the slow part. */}
                        {telHref(lead.phone) ? (
                          <span className="inline-flex items-center gap-2">
                            <a
                              href={telHref(lead.phone)!}
                              className="font-mono text-accentInk transition-colors hover:underline"
                              title={`Call ${lead.name}`}
                            >
                              {lead.phone}
                            </a>
                            {/* WhatsApp is how most of these conversations
                                actually happen, so it sits beside the number
                                rather than behind the lead detail page. */}
                            {whatsappHref(lead.phone) && (
                              <a
                                href={whatsappHref(lead.phone)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`WhatsApp ${lead.name}`}
                                aria-label={`WhatsApp ${lead.name}`}
                                className="shrink-0 text-muted transition-colors hover:text-success"
                              >
                                <Icon name="whatsapp" size={15} />
                              </a>
                            )}
                          </span>
                        ) : lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="transition-colors hover:text-text hover:underline"
                          >
                            {lead.email}
                          </a>
                        ) : (
                          "—"
                        )}
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
                        {lead.city ? (
                          <span className="text-muted">{lead.city}</span>
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
                            {formatFollowUp(lead.followUpAt)}
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
        </>
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
