import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listLeadsByDesk } from "@/lib/leads";
import { listDesks } from "@/lib/desks";
import { formatValue, parseJourney, followUpState } from "@/lib/leads-shared";
import { initials, colorFromName } from "@/lib/avatar";
import { DeskStepForm } from "../../_components/desk-step-form";

export default async function DeskJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const { id } = await params;
  const orgId = user.orgId ?? "";

  const desks = orgId ? await listDesks(orgId) : [];
  const desk = desks.find((d) => d.id === id);
  if (!desk) notFound();

  const leads = orgId ? await listLeadsByDesk(orgId, id) : [];
  const now = Date.now();
  const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <Link href="/leads" className="text-xs text-muted hover:text-text">
        ‹ Back to pipeline
      </Link>
      <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        <span style={{ color: desk.color }}>▣</span> Desk
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{desk.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {leads.length} lead{leads.length === 1 ? "" : "s"} on this desk. Open a lead
        for its full milestone &amp; timeline, or update the step inline.
      </p>

      {leads.length === 0 ? (
        <div className="card mt-6 px-6 py-16 text-center text-sm text-muted">
          No leads on the {desk.name} desk right now.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {leads.map((lead) => {
            const journey = parseJourney(lead.journey);
            const step = journey[id];
            const fu = followUpState(lead.followUpAt, now);
            return (
              <div key={lead.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: colorFromName(lead.name) }}
                  >
                    {initials(lead.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-sm font-medium hover:text-accentInk"
                    >
                      {lead.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                      <span>{lead.company || "No company"}</span>
                      {formatValue(lead.estimatedValue) && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="font-mono">{formatValue(lead.estimatedValue)}</span>
                        </>
                      )}
                      {lead.phone && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="font-mono">{lead.phone}</span>
                        </>
                      )}
                    </div>
                    {/* Journey progress dots */}
                    <div className="mt-1.5 flex items-center gap-1">
                      {desks.map((d) => {
                        const dDone = journey[d.id]?.done;
                        const dCurrent = d.id === lead.deskId;
                        return (
                          <span
                            key={d.id}
                            title={`${d.name}${dDone ? " ✓" : dCurrent ? " (current)" : ""}`}
                            className={`h-1.5 rounded-full transition-all ${
                              dCurrent ? "w-4" : "w-1.5"
                            }`}
                            style={{
                              backgroundColor: dDone
                                ? d.color
                                : dCurrent
                                  ? d.color
                                  : "rgb(var(--c-border))",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {lead.followUpAt && fu !== "later" && (
                      <span
                        className={`text-[10px] ${
                          fu === "overdue" ? "text-danger" : "text-marigold"
                        }`}
                      >
                        ⏰ {dateFmt.format(lead.followUpAt)}
                      </span>
                    )}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-xs text-muted hover:text-accentInk"
                    >
                      Open →
                    </Link>
                  </div>
                </div>

                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-[11px] text-muted hover:text-text">
                    <span className="group-open:hidden">＋ Update {desk.name} step</span>
                    <span className="hidden group-open:inline">Close ▾</span>
                  </summary>
                  <div className="mt-2">
                    <DeskStepForm
                      leadId={lead.id}
                      deskId={id}
                      deskName={desk.name}
                      step={step}
                    />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
