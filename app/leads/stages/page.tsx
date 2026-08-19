import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listLeads, listLeadStages } from "@/lib/leads";
import { StageManager, type StageRowData } from "../_components/stage-manager";

export default async function ManageStagesPage() {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  // Stage management is Lead-Manager-only.
  if (!user.roles.includes("super_admin")) redirect("/leads");
  const orgId = user.orgId ?? "";
  const [leads, stages] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listLeadStages(orgId) : Promise.resolve([]),
  ]);

  const counts = new Map<string, number>();
  for (const l of leads) {
    if (l.stageId) counts.set(l.stageId, (counts.get(l.stageId) ?? 0) + 1);
  }
  const rows: StageRowData[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    kind: s.kind,
    position: s.position,
    count: counts.get(s.id) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      <Link href="/leads" className="text-xs text-muted hover:text-text">
        ‹ Back to pipeline
      </Link>
      <div className="mt-3 mb-1 text-xs uppercase tracking-wide text-muted">
        Lead manager
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Pipeline stages</h1>
      <p className="mb-6 mt-1 max-w-xl text-sm text-muted">
        Customize the stages a lead moves through. Add your own steps (e.g.
        “Proposal Sent”, “Negotiation”), recolor or rename any stage, and reorder
        them to match how you actually sell.
      </p>

      <StageManager stages={rows} />
    </div>
  );
}
