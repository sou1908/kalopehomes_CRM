import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listLeads } from "@/lib/leads";
import { listPipelines } from "@/lib/pipelines";
import { PipelineManager, type PipelineRowData } from "../_components/pipeline-manager";

export default async function ManagePipelinesPage() {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const orgId = user.orgId ?? "";
  const [leads, pipelines] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listPipelines(orgId) : Promise.resolve([]),
  ]);

  const counts = new Map<string, number>();
  for (const l of leads) {
    if (l.pipelineId) counts.set(l.pipelineId, (counts.get(l.pipelineId) ?? 0) + 1);
  }
  const rows: PipelineRowData[] = pipelines.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    position: d.position,
    roles: d.roles,
    count: counts.get(d.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      <Link href="/leads" className="text-xs text-muted hover:text-text">
        ‹ Back to pipeline
      </Link>
      <div className="mt-3 mb-1 text-xs uppercase tracking-wide text-muted">
        Lead manager
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Handling pipelines</h1>
      <p className="mb-6 mt-1 max-w-xl text-sm text-muted">
        Pipelines are the team-handoff track — who’s working a lead right now
        (Telecalling → Site Visit → Manager). Add your own pipelines, recolor, rename,
        or reorder them. This is separate from the sales stages.
      </p>

      <PipelineManager pipelines={rows} />
    </div>
  );
}
