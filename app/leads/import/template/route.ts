import { requireRole } from "@/lib/auth";
import { LEAD_SURFACE_ROLES } from "@/lib/roles";
import { listLeadStages } from "@/lib/leads";
import { toCsv } from "@/lib/csv";
import { TEMPLATE_HEADERS } from "@/lib/lead-import";

/**
 * A starter CSV with the right headings and one filled-in example row, so the
 * shape of a value (an amount, a date) is shown rather than described.
 */
export async function GET() {
  const user = await requireRole([...LEAD_SURFACE_ROLES]);
  const stages = user.orgId ? await listLeadStages(user.orgId) : [];
  const firstStage = stages[0]?.name ?? "New";

  const example = [
    "Priya Sharma",
    "Sharma Constructions",
    "priya@example.com",
    "+91 98765 43210",
    "Website",
    "150000",
    "Flat 4B, MG Road",
    "Pune",
    "Maharashtra",
    "411001",
    "India",
    "Advertisement",
    firstStage,
    "09/06/2026",
    "Asked for a callback after 6pm.",
  ];

  // The BOM keeps Excel from mangling non-ASCII when the file is opened.
  const body = "﻿" + toCsv(TEMPLATE_HEADERS, [example]);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kalope-leads-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
