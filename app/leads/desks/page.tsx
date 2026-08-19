import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listLeads } from "@/lib/leads";
import { listDesks } from "@/lib/desks";
import { DeskManager, type DeskRowData } from "../_components/desk-manager";

export default async function ManageDesksPage() {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  const orgId = user.orgId ?? "";
  const [leads, desks] = await Promise.all([
    orgId ? listLeads(orgId) : Promise.resolve([]),
    orgId ? listDesks(orgId) : Promise.resolve([]),
  ]);

  const counts = new Map<string, number>();
  for (const l of leads) {
    if (l.deskId) counts.set(l.deskId, (counts.get(l.deskId) ?? 0) + 1);
  }
  const rows: DeskRowData[] = desks.map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    position: d.position,
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
      <h1 className="text-2xl font-semibold tracking-tight">Handling desks</h1>
      <p className="mb-6 mt-1 max-w-xl text-sm text-muted">
        Desks are the team-handoff track — who’s working a lead right now
        (Telecalling → Site Visit → Manager). Add your own desks, recolor, rename,
        or reorder them. This is separate from the sales stages.
      </p>

      <DeskManager desks={rows} />
    </div>
  );
}
