import { NextResponse } from "next/server";
import { ensureAdminUser } from "@/lib/bootstrap";
import { runFollowUpDigestAllOrgs } from "@/lib/digest";

// Daily follow-up digest endpoint — point a scheduler (cron / the /schedule
// feature) at GET /api/cron/follow-up-digest. If CRON_SECRET is set, the caller
// must supply it via ?key= or the x-cron-key header. The digest is idempotent
// (once per org per calendar day), so extra hits in a day are no-ops.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const provided = url.searchParams.get("key") ?? request.headers.get("x-cron-key");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await ensureAdminUser();
  const result = await runFollowUpDigestAllOrgs();
  return NextResponse.json({ ok: true, ...result });
}
