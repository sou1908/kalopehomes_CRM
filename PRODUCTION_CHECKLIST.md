# Production Readiness Checklist

Status as of 2026-05-31. Use this as the pre-launch punch list before letting any real client touch the system.

---

## 🛑 Blockers — must fix before going live

These will break things or cause data loss if you skip them.

### 1. File uploads will disappear on deploy
**Problem**: Uploads go to `./uploads/` on the host's local filesystem. Most platforms (Vercel, Render free, etc.) have ephemeral storage — files get wiped on every redeploy.
**Fix**: Swap [lib/storage.ts](lib/storage.ts) to write to Cloudflare R2 (free 10 GB, S3-compatible).
**Time**: ~30 minutes once you have R2 credentials.

### 2. Secrets are placeholders
Fix these values in `.env.local` before deploying:
- `SESSION_SECRET` — currently a placeholder. Replace with a 32+ char random string (anyone who learns it can forge sessions).
- `ADMIN_PASSWORD` — currently `Error@404`. Change to something strong.
- `PUBLIC_BASE_URL` — currently `http://localhost:3000`. Must be your real `https://...` domain or magic links break.

**Time**: 2 minutes.

### 3. Email notifications (deferred)
**Problem**: The bell only works while the owner has the dashboard open. Weekend/evening client submissions go unseen.
**Plan**: Resend integration with verified domain. See [memory/email_resend_plan.md](memory/email_resend_plan.md).
**Time**: ~30 minutes once Resend API key + DNS-verified domain are ready.

### 4. SQLite = single point of failure
**Problem**: Entire DB is one file (`./data/issuetracker.db`). One bad deploy / disk failure = total data loss.
**Fix (minimum)**: Daily backup cron — `cp data/issuetracker.db backups/$(date +%F).db`.
**Fix (better)**: Migrate to managed Postgres (Neon / Supabase / Turso).
**Time**: 10 min for cron backup, ~2 hours for Postgres migration.

---

## ⚠️ Important — fix soon after going live

### 5. HTTPS (required for voice recorder)
**Problem**: MediaRecorder API needs a secure context. On `http://`, clients see "microphone blocked" error.
**Fix**:
- **Vercel / Netlify / Railway** → automatic HTTPS, zero work.
- **VPS** → install Caddy, one config file, auto-renews certs forever (~15 min).
**Time**: 0 min code, ~15 min infra.

### 6. Custom error pages
**Problem**: Server errors show Next.js' default white 500 screen. Looks broken.
**Fix**: Create `app/error.tsx` (500) and `app/not-found.tsx` (404) with branded fallback + "back to dashboard" link.
**Time**: ~20 minutes.

### 7. Rate limiting
**Problem**: Anyone with a magic link could spam-submit issues. No defense.
**Fix**: Per-IP throttle on issue submission (e.g., max 10 per minute per IP). In-memory Map with TTL — no Redis needed for single-server deployment.
**Time**: ~30 minutes.

### 8. Logging
**Problem**: When something breaks in production you won't know unless you SSH in and `tail` the log.
**Fix**: Add `pino` for structured logs. Capture: server errors, auth failures, payment events, file uploads, rate-limit hits. Output to stdout (visible in hosting platform's log viewer).
**Time**: ~30 minutes.

### 9. Razorpay test keys are empty
**Problem**: Payments only work via the "Grant manually" button. Fine if you collect via UPI/invoice externally; not fine if clients should pay in-app.
**Fix**: Get live Razorpay credentials, replace test keys, also implement a `/api/razorpay/webhook` for server-side payment verification.
**Time**: ~1 hour (sign-up + KYC may take longer if not already done).

---

## ✅ Already solid

- Auth flow + session cookies (httpOnly, same-site)
- Schema with auto-migrations on boot
- File serving route has path-traversal protection
- Single-tenant model matches the business
- All core features working: projects, magic links, issues with iterations, approval, edit, search, notifications, PDF export, team assignment, real-time refresh

---

## 🎯 Minimum viable production path

If you want to ship to **one trusted client this week**:

1. Buy a domain (~₹600/year) + cheap VPS (Hostinger ₹300/mo or DigitalOcean $4/mo) **— 30 min**
2. Deploy with HTTPS via Caddy **— 15 min**
3. Move uploads to Cloudflare R2 **— 30 min**
4. Set real `SESSION_SECRET` + `ADMIN_PASSWORD` + `PUBLIC_BASE_URL` **— 2 min**
5. Add daily SQLite backup cron **— 10 min**
6. Add error pages + rate limit + logging **— ~80 min**
7. Wire Resend for emails (once domain DNS is set) **— 30 min**

**Total**: ~3 hours of focused work to be production-grade.

---

## Recommended next-session order

Smallest blockers first to build momentum:

1. ✅ Change `SESSION_SECRET` + `ADMIN_PASSWORD` + `PUBLIC_BASE_URL` (2 min)
2. ✅ Error pages (20 min)
3. ✅ Logging (30 min)
4. ✅ Rate limiting (30 min)
5. 🔧 Cloud storage swap to R2 (30 min, needs R2 credentials)
6. 🔧 Resend email integration (30 min, needs Resend key + verified domain)
7. 🔧 Daily backup cron (10 min, hosting-specific)
8. 🔧 Deploy + HTTPS (15 min, infra)

Items 2-4 are pure code and can be knocked out in ~80 minutes in one session.
