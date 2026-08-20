import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureAdminUser } from "@/lib/bootstrap";
import { runFollowUpDigestAllOrgs } from "@/lib/digest";

// Daily follow-up digest endpoint — point a scheduler (cron / the /schedule
// feature) at GET /api/cron/follow-up-digest. If CRON_SECRET is set, the caller
// must supply it via ?key= or the x-cron-key header. The digest is idempotent
// (once per org per calendar day), so extra hits in a day are no-ops.
export async function GET(request: Request) {
  // Fails closed. Skipping the check when no secret was configured left an
  // unauthenticated write endpoint open by default — and "we forgot to set it"
  // is exactly when that happens.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const provided = url.searchParams.get("key") ?? request.headers.get("x-cron-key");
  if (!provided || !timingSafeEqualStr(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAdminUser();
  const result = await runFollowUpDigestAllOrgs();
  return NextResponse.json({ ok: true, ...result });
}

/** Compares without leaking the answer through how long it took. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
