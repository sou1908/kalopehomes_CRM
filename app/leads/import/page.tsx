import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { LEAD_SURFACE_ROLES } from "@/lib/roles";
import { listLeadStages } from "@/lib/leads";
import { ImportClient } from "./_components/import-client";

export default async function ImportLeadsPage() {
  const user = await requireRole([...LEAD_SURFACE_ROLES]);
  const orgId = user.orgId ?? "";
  const stages = orgId ? await listLeadStages(orgId) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-3 sm:px-8">
      <Link
        href="/leads"
        className="font-mono text-[11px] text-muted transition-colors hover:text-text"
      >
        ‹ Back to pipeline
      </Link>

      <div className="mt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Lead manager
        </div>
        <h1 className="font-display text-[34px] font-medium leading-none tracking-[-0.015em]">
          Import leads
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted">
          Upload a CSV from your marketing team and create every lead in one go.
          You&apos;ll see exactly what will be created — and what will be skipped —
          before anything is saved.
        </p>
      </div>

      <ImportClient />

      {/* Reference — what the file can contain. */}
      <section className="mt-10 border-t border-border pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-medium">Preparing your file</h2>
          <Link
            href="/leads/import/template"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
          >
            Download a template CSV
          </Link>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          The first row must be the column headings. Only{" "}
          <span className="text-text">Name</span> is required — leave out any
          column you don&apos;t have. Headings aren&apos;t case-sensitive, and common
          alternatives are recognised, so a marketing export usually works as-is.
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2 font-normal">Column</th>
                <th className="px-3 py-2 font-normal">Also accepted</th>
                <th className="px-3 py-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              <Row
                col="Name"
                alt="Contact Name, Full Name, Customer Name"
                note="Required. Rows without one are skipped."
              />
              <Row col="Company" alt="Organisation, Firm, Business" />
              <Row col="Email" alt="Email Address, Email ID" />
              <Row
                col="Phone"
                alt="Mobile, Contact Number, WhatsApp"
                note="Any format — +91, spaces and dashes are fine."
              />
              <Row col="Purpose" alt="Requirement, Service, Project Type" />
              <Row
                col="Estimated Value"
                alt="Budget, Amount, Deal Value"
                note="₹1,50,000 · 150000 · 1.5L · 2Cr all work."
              />
              <Row col="Street / Area" alt="Address, Street, Area" />
              <Row col="City" alt="Town, District" />
              <Row col="State" alt="Region, Province" />
              <Row col="Pin Code" alt="PIN, Postal Code, Zip" />
              <Row col="Country" alt="—" />
              <Row col="Source" alt="Lead Source, Channel, Campaign, Platform" />
              <Row
                col="Stage"
                alt="Status, Pipeline Stage"
                note={
                  stages.length > 0
                    ? `One of: ${stages.map((s) => s.name).join(", ")}. Anything else falls back to ${stages[0].name}.`
                    : "Matched to your pipeline stages by name."
                }
              />
              <Row
                col="Follow-up Date"
                alt="Callback Date, Next Follow-up"
                note="Day first — 09/06/2026 — or 2026-06-09."
              />
              <Row col="Notes" alt="Comments, Message, Remarks, Description" />
            </tbody>
          </table>
        </div>

        <ul className="mt-4 space-y-1.5 text-[13px] leading-relaxed text-muted">
          <li>
            <span className="text-text">Duplicates</span> are found by email or
            phone — both against leads already in the CRM and against repeats
            inside the file itself. You choose whether to skip them.
          </li>
          <li>
            <span className="text-text">Columns the CRM doesn&apos;t store</span> are
            ignored rather than rejected, so you can upload an export without
            trimming it first.
          </li>
          <li>
            <span className="text-text">Imported leads</span> start on the first
            desk, ready to be called, and each one gets a &ldquo;Lead
            created&rdquo; entry in its activity log.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Row({ col, alt, note }: { col: string; alt: string; note?: string }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{col}</td>
      <td className="px-3 py-2 text-muted">{alt}</td>
      <td className="px-3 py-2 text-muted">{note ?? ""}</td>
    </tr>
  );
}
