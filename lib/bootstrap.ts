import "server-only";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  organizations,
  userRoles,
  leads,
  leadStages,
  leadTags,
  desks,
} from "./db/schema";
import {
  DEFAULT_LEAD_STAGES,
  DEFAULT_LEAD_TAGS,
  DEFAULT_DESKS,
} from "./leads-shared";

let bootstrapPromise: Promise<void> | null = null;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "org"
  );
}

/**
 * Ensures the single-org seam is in place:
 *  - a default organization exists,
 *  - the admin user exists (from env) and belongs to it as super_admin,
 *  - any pre-existing users are backfilled into the default org.
 * Idempotent; safe to call on every request (memoised).
 */
export function ensureAdminUser(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    // 1. Default organization (tenant boundary; one row in v0).
    const orgName = (process.env.ORG_NAME ?? "My Agency").trim();
    const orgSlug = slugify(process.env.ORG_SLUG ?? orgName);
    let org = (
      await db.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1)
    )[0];
    if (!org) {
      // Fall back to any existing org before creating a new one, so a renamed
      // ORG_NAME doesn't spawn a duplicate tenant.
      org = (await db.select().from(organizations).limit(1))[0];
    }
    if (!org) {
      const id = nanoid(21);
      await db.insert(organizations).values({ id, name: orgName, slug: orgSlug });
      org = { id, name: orgName, slug: orgSlug, createdAt: new Date() };
      console.log(`[bootstrap] Created default organization "${orgName}"`);
    }
    const orgId = org.id;

    // 2. Admin user from env.
    const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "";
    const name = (process.env.ADMIN_NAME ?? "Admin").trim();

    let adminId: string | null = null;
    if (!email || !password) {
      console.warn(
        "[bootstrap] ADMIN_EMAIL or ADMIN_PASSWORD missing — admin user not created. Set them in .env.local.",
      );
    } else {
      const existing = await db
        .select({ id: users.id, passwordHash: users.passwordHash, name: users.name })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const passwordHash = await bcrypt.hash(password, 10);

      if (existing.length === 0) {
        adminId = nanoid(21);
        await db.insert(users).values({ id: adminId, orgId, email, passwordHash, name });
        console.log(`[bootstrap] Created admin user ${email}`);
      } else {
        adminId = existing[0].id;
        // Keep the admin password/name in sync with env so the operator can
        // rotate by editing .env.local and restarting.
        const matches = await bcrypt.compare(password, existing[0].passwordHash);
        if (!matches || existing[0].name !== name) {
          await db
            .update(users)
            .set({ passwordHash, name })
            .where(eq(users.id, adminId));
          console.log(`[bootstrap] Updated admin password/name for ${email}`);
        }
      }
    }

    // 3. Backfill any users missing an org into the default org.
    await db.update(users).set({ orgId }).where(isNull(users.orgId));

    // 3d. Seed default lead pipeline stages (once), then backfill any lead whose
    // stage_id is null by mapping its legacy keyword (new/contacted/…) to the
    // matching seeded stage. Idempotent.
    const existingStages = await db
      .select({ id: leadStages.id, name: leadStages.name })
      .from(leadStages)
      .where(eq(leadStages.orgId, orgId));
    if (existingStages.length === 0) {
      for (const s of DEFAULT_LEAD_STAGES) {
        const id = nanoid(21);
        await db.insert(leadStages).values({
          id,
          orgId,
          name: s.name,
          color: s.color,
          kind: s.kind,
          position: s.position,
          probability: s.probability,
        });
        existingStages.push({ id, name: s.name });
      }
      console.log(`[bootstrap] Seeded ${DEFAULT_LEAD_STAGES.length} default lead stages`);
    }
    // Map legacy keyword → seeded stage id (seeded names are exactly the keywords).
    const stageByKeyword = new Map(
      existingStages.map((s) => [s.name.toLowerCase(), s.id] as const),
    );
    const orphanLeads = await db
      .select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .where(and(eq(leads.orgId, orgId), isNull(leads.stageId)));
    for (const l of orphanLeads) {
      const stageId = stageByKeyword.get((l.stage ?? "new").toLowerCase());
      if (stageId) {
        await db.update(leads).set({ stageId }).where(eq(leads.id, l.id));
      }
    }
    if (orphanLeads.length > 0) {
      console.log(`[bootstrap] Linked ${orphanLeads.length} lead(s) to stage rows`);
    }

    // 3e. Seed default CRM lead tags (once).
    const existingLeadTags = await db
      .select({ id: leadTags.id })
      .from(leadTags)
      .where(eq(leadTags.orgId, orgId))
      .limit(1);
    if (existingLeadTags.length === 0) {
      for (const t of DEFAULT_LEAD_TAGS) {
        await db
          .insert(leadTags)
          .values({ id: nanoid(21), orgId, name: t.name, color: t.color });
      }
      console.log(`[bootstrap] Seeded ${DEFAULT_LEAD_TAGS.length} default lead tags`);
    }

    // 3f. Seed default handling desks (once), then park any lead with no desk on
    // the first one (Telecalling). Idempotent.
    const existingDesks = await db
      .select({ id: desks.id })
      .from(desks)
      .where(eq(desks.orgId, orgId))
      .orderBy(asc(desks.position));
    if (existingDesks.length === 0) {
      for (const d of DEFAULT_DESKS) {
        const id = nanoid(21);
        await db
          .insert(desks)
          .values({ id, orgId, name: d.name, color: d.color, position: d.position });
        existingDesks.push({ id });
      }
      console.log(`[bootstrap] Seeded ${DEFAULT_DESKS.length} default desks`);
    }
    const firstDeskId = existingDesks[0]?.id;
    if (firstDeskId) {
      await db
        .update(leads)
        .set({ deskId: firstDeskId })
        .where(and(eq(leads.orgId, orgId), isNull(leads.deskId)));
    }

    // 4. Ensure the admin holds the super_admin role.
    if (adminId) {
      const hasRole = await db
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(sql`${userRoles.userId} = ${adminId} AND ${userRoles.role} = 'super_admin'`)
        .limit(1);
      if (hasRole.length === 0) {
        await db
          .insert(userRoles)
          .values({ id: nanoid(21), userId: adminId, role: "super_admin" });
        console.log(`[bootstrap] Granted super_admin to ${email}`);
      }
    }
  })().catch((err) => {
    console.error("[bootstrap] failed:", err);
    bootstrapPromise = null;
  });
  return bootstrapPromise;
}
