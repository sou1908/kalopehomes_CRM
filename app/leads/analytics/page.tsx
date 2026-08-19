import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listLeads, listLeadStages } from "@/lib/leads";
import { formatValue, summarize, stageProbability } from "@/lib/leads-shared";

export default async function LeadsAnalyticsPage() {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  // Analytics is Lead-Manager-only.
  if (!user.roles.includes("admin")) redirect("/leads");
  const orgId = user.orgId ?? "";
  const [leads, stages] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
  ]);
  const stats = summarize(leads, stages);
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Weighted forecast = Σ (open lead value × its stage win-probability).
  let weighted = 0;
  for (const l of leads) {
    const stage = l.stageId ? stageById.get(l.stageId) : undefined;
    if (!stage || stage.kind !== "open") continue;
    weighted += (l.estimatedValue ?? 0) * (stageProbability(stage) / 100);
  }

  // Value sitting in each stage.
  const valueByStage = new Map<string, number>();
  for (const l of leads) {
    if (!l.stageId) continue;
    valueByStage.set(l.stageId, (valueByStage.get(l.stageId) ?? 0) + (l.estimatedValue ?? 0));
  }
  const maxStageValue = Math.max(1, ...[...valueByStage.values()]);

  // Conversion grouped by source.
  type SrcRow = { source: string; total: number; won: number; lost: number; value: number };
  const bySource = new Map<string, SrcRow>();
  for (const l of leads) {
    const key = l.source?.trim() || "Unknown";
    const row = bySource.get(key) ?? { source: key, total: 0, won: 0, lost: 0, value: 0 };
    row.total += 1;
    const stage = l.stageId ? stageById.get(l.stageId) : undefined;
    if (stage?.kind === "won") {
      row.won += 1;
      row.value += l.estimatedValue ?? 0;
    } else if (stage?.kind === "lost") row.lost += 1;
    bySource.set(key, row);
  }
  const sourceRows = [...bySource.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">Lead manager</div>
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        A read of your pipeline — what it's worth, how likely it is to close, and
        where your best leads come from.
      </p>

      {/* Top metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Weighted forecast" value={formatValue(Math.round(weighted)) ?? "₹0"} hint="open value × win %" tone="accent" />
        <Metric label="Open pipeline" value={formatValue(stats.openValue) ?? "₹0"} hint={`${stats.open} open leads`} />
        <Metric label="Won value" value={formatValue(stats.wonValue) ?? "₹0"} hint={`${stats.won} won`} tone="success" />
        <Metric label="Conversion" value={`${Math.round(stats.conversionRate * 100)}%`} hint={`${stats.won} won · ${stats.lost} lost`} />
      </div>

      {/* Value by stage */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Value by stage</h2>
        <div className="card space-y-3 p-5">
          {stages.length === 0 && <p className="text-sm text-muted">No stages.</p>}
          {stages.map((s) => {
            const v = valueByStage.get(s.id) ?? 0;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="flex w-32 shrink-0 items-center gap-2 text-sm">
                  <span style={{ color: s.color }}>●</span>
                  <span className="truncate">{s.name}</span>
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(v / maxStageValue) * 100}%`, background: s.color }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right font-mono text-xs text-muted">
                  {formatValue(v) ?? "₹0"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Conversion by source */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">By source</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 text-right font-medium">Leads</th>
                <th className="px-4 py-2.5 text-right font-medium">Won</th>
                <th className="px-4 py-2.5 text-right font-medium">Lost</th>
                <th className="px-4 py-2.5 text-right font-medium">Win rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Won value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sourceRows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No leads yet.</td></tr>
              )}
              {sourceRows.map((r) => {
                const closed = r.won + r.lost;
                const rate = closed > 0 ? Math.round((r.won / closed) * 100) : 0;
                return (
                  <tr key={r.source}>
                    <td className="px-4 py-3">{r.source}</td>
                    <td className="px-4 py-3 text-right text-muted">{r.total}</td>
                    <td className="px-4 py-3 text-right text-success">{r.won}</td>
                    <td className="px-4 py-3 text-right text-muted">{r.lost}</td>
                    <td className="px-4 py-3 text-right">{closed > 0 ? `${rate}%` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {formatValue(r.value) ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "success";
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-0.5 text-2xl font-semibold tracking-tight ${
          tone === "success" ? "text-success" : tone === "accent" ? "text-accentInk" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
