import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { leads } from "./db/schema";
import { parseCsv, normalizeHeader } from "./csv";
import { createLead, listLeadStages, type LeadActor } from "./leads";
import { firstDeskId, setLeadDesk } from "./desks";

/**
 * CSV → leads. Built for marketing dumps (Facebook lead ads, spreadsheets from
 * an agency), which means the input is assumed messy: unpredictable column
 * names, duplicate rows, half-filled fields, phone numbers in five formats.
 *
 * The rule throughout: only a missing name blocks a row. Everything else that
 * can't be understood becomes a warning and imports anyway, because dropping a
 * real lead over a malformed email is worse than keeping an imperfect record.
 */

/** Hard ceilings — a bulk import shouldn't be able to run away. */
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportField =
  | "name"
  | "company"
  | "email"
  | "phone"
  | "purpose"
  | "estimatedValue"
  | "address"
  | "city"
  | "state"
  | "pincode"
  | "country"
  | "source"
  | "stage"
  | "notes"
  | "followUpAt";

/**
 * Accepted column headings per field. Compared after `normalizeHeader`, so
 * case, spaces, underscores and hyphens don't matter.
 */
const COLUMN_ALIASES: Record<ImportField, string[]> = {
  name: ["name", "contactname", "fullname", "leadname", "customername", "clientname", "person"],
  company: ["company", "companyname", "organisation", "organization", "firm", "business"],
  email: ["email", "emailaddress", "mail", "emailid", "email1"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contactnumber", "contactno", "whatsapp", "number"],
  purpose: ["purpose", "requirement", "requirements", "service", "interestedin", "projecttype", "work"],
  estimatedValue: ["estimatedvalue", "value", "budget", "dealvalue", "amount", "price", "estimate"],
  address: ["address", "street", "streetarea", "area", "addressline1", "addressline"],
  city: ["city", "town", "district"],
  state: ["state", "region", "province"],
  pincode: ["pincode", "pin", "postalcode", "postcode", "zip", "zipcode"],
  country: ["country"],
  source: ["source", "leadsource", "channel", "campaign", "platform", "medium"],
  stage: ["stage", "status", "pipelinestage", "leadstage"],
  notes: ["notes", "note", "comments", "comment", "message", "remarks", "description"],
  followUpAt: ["followup", "followupdate", "followupat", "nextfollowup", "callbackdate", "calldate"],
};

/** The header row we hand out in the downloadable template. */
export const TEMPLATE_HEADERS = [
  "Name",
  "Company",
  "Email",
  "Phone",
  "Purpose",
  "Estimated Value",
  "Street / Area",
  "City",
  "State",
  "Pin Code",
  "Country",
  "Source",
  "Stage",
  "Follow-up Date",
  "Notes",
];

export type ImportRow = {
  /** 1-based row number in the file as the user sees it (header is row 1). */
  line: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  purpose: string | null;
  estimatedValue: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  source: string | null;
  stageId: string | null;
  stageName: string | null;
  followUpAt: Date | null;
  notes: string;
  /** Blocks the row from importing. */
  error: string | null;
  /** Imported anyway, but worth the user's attention. */
  warnings: string[];
  /** Matches a lead already in the CRM, or an earlier row in this same file. */
  duplicateOf: "existing" | "file" | null;
};

export type ImportPreview = {
  rows: ImportRow[];
  /** Headings we recognised, in file order. */
  matched: Array<{ header: string; field: ImportField }>;
  /** Headings we didn't recognise — their data is ignored. */
  ignored: string[];
  /** True when the file had no usable "name" column at all. */
  missingNameColumn: boolean;
  totals: { total: number; ready: number; failed: number; duplicates: number };
  truncated: boolean;
};

/** Digits only, last 10 — so +91 98765 43210 and 09876543210 compare equal. */
function phoneKey(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function emailKey(email: string | null): string | null {
  return email ? email.trim().toLowerCase() || null : null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value);
}

/** Rupees as typed by a human: "₹1,50,000", "1.5L", "250000", "2 Cr". */
function parseMoney(raw: string): { value: number | null; warning: string | null } {
  const cleaned = raw.replace(/[₹,\s]/g, "").toLowerCase();
  if (!cleaned) return { value: null, warning: null };

  const lakh = /^(\d+(?:\.\d+)?)(l|lac|lakh|lakhs)$/.exec(cleaned);
  if (lakh) return { value: Math.round(parseFloat(lakh[1]) * 100_000), warning: null };
  const crore = /^(\d+(?:\.\d+)?)(cr|crore|crores)$/.exec(cleaned);
  if (crore) return { value: Math.round(parseFloat(crore[1]) * 10_000_000), warning: null };

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { value: null, warning: `Couldn't read "${raw}" as an amount — left blank.` };
  }
  return { value: Math.round(n), warning: null };
}

/**
 * Dates as typed by a human. Day-first is assumed for slash and dot formats
 * (dd/mm/yyyy) because this is an India-facing CRM; ISO (yyyy-mm-dd) is
 * detected by shape and read correctly either way.
 */
function parseWhen(raw: string): { value: Date | null; warning: string | null } {
  const s = raw.trim();
  if (!s) return { value: null, warning: null };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime())
      ? { value: null, warning: `Couldn't read the date "${raw}".` }
      : { value: d, warning: null };
  }

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime())
      ? { value: null, warning: `Couldn't read the date "${raw}".` }
      : { value: d, warning: null };
  }

  const loose = new Date(s);
  if (!Number.isNaN(loose.getTime())) return { value: loose, warning: null };
  return { value: null, warning: `Couldn't read "${raw}" as a date — left blank.` };
}

/**
 * Reads the file, maps its columns, validates every row and flags duplicates.
 * Touches nothing — the caller shows this to the user, who then confirms.
 */
export async function previewLeadImport(
  csvText: string,
  orgId: string,
): Promise<ImportPreview> {
  const table = parseCsv(csvText);
  const stages = await listLeadStages(orgId);

  if (table.length === 0) {
    return {
      rows: [],
      matched: [],
      ignored: [],
      missingNameColumn: true,
      totals: { total: 0, ready: 0, failed: 0, duplicates: 0 },
      truncated: false,
    };
  }

  // ── Map columns ────────────────────────────────────────────────────────
  const headerRow = table[0];
  const columnField: Array<ImportField | null> = [];
  const matched: Array<{ header: string; field: ImportField }> = [];
  const ignored: string[] = [];
  const taken = new Set<ImportField>();

  for (const header of headerRow) {
    const key = normalizeHeader(header);
    let found: ImportField | null = null;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<
      [ImportField, string[]]
    >) {
      // First column to claim a field wins, so a stray second "Email" column
      // doesn't quietly overwrite the first.
      if (!taken.has(field) && aliases.includes(key)) {
        found = field;
        break;
      }
    }
    if (found) {
      taken.add(found);
      matched.push({ header: header.trim(), field: found });
    } else if (header.trim()) {
      ignored.push(header.trim());
    }
    columnField.push(found);
  }

  const missingNameColumn = !taken.has("name");

  // ── Existing leads, for duplicate detection ────────────────────────────
  const existing = await db
    .select({ email: leads.email, phone: leads.phone })
    .from(leads)
    .where(eq(leads.orgId, orgId));
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();
  for (const l of existing) {
    const e = emailKey(l.email);
    if (e) existingEmails.add(e);
    const p = phoneKey(l.phone);
    if (p) existingPhones.add(p);
  }

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  const dataRows = table.slice(1);
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const usable = truncated ? dataRows.slice(0, MAX_IMPORT_ROWS) : dataRows;

  const rows: ImportRow[] = usable.map((cells, index) => {
    const get = (field: ImportField): string => {
      const at = columnField.indexOf(field);
      if (at === -1) return "";
      return (cells[at] ?? "").trim();
    };

    const warnings: string[] = [];

    const name = get("name");
    const email = get("email") || null;
    const phone = get("phone") || null;

    if (email && !looksLikeEmail(email)) {
      warnings.push(`"${email}" doesn't look like an email address.`);
    }

    const money = parseMoney(get("estimatedValue"));
    if (money.warning) warnings.push(money.warning);

    const when = parseWhen(get("followUpAt"));
    if (when.warning) warnings.push(when.warning);

    // Stage by name, case-insensitive. Unknown names fall back to the
    // pipeline's first stage rather than failing the row.
    const stageName = get("stage") || null;
    let stageId: string | null = null;
    if (stageName) {
      const hit = stages.find(
        (s) => s.name.toLowerCase() === stageName.toLowerCase(),
      );
      if (hit) stageId = hit.id;
      else
        warnings.push(
          `No stage called "${stageName}" — using ${stages[0]?.name ?? "the first stage"}.`,
        );
    }

    // Duplicates: against the CRM first, then against earlier rows in this file.
    const eKey = emailKey(email);
    const pKey = phoneKey(phone);
    let duplicateOf: ImportRow["duplicateOf"] = null;
    if ((eKey && existingEmails.has(eKey)) || (pKey && existingPhones.has(pKey))) {
      duplicateOf = "existing";
    } else if ((eKey && seenEmails.has(eKey)) || (pKey && seenPhones.has(pKey))) {
      duplicateOf = "file";
    }
    if (eKey) seenEmails.add(eKey);
    if (pKey) seenPhones.add(pKey);

    return {
      line: index + 2, // +1 for the header, +1 to be 1-based
      name,
      company: get("company") || null,
      email,
      phone,
      purpose: get("purpose") || null,
      estimatedValue: money.value,
      address: get("address") || null,
      city: get("city") || null,
      state: get("state") || null,
      pincode: get("pincode") || null,
      country: get("country") || null,
      source: get("source") || null,
      stageId,
      stageName,
      followUpAt: when.value,
      notes: get("notes"),
      error: name ? null : "No name — every lead needs one.",
      warnings,
      duplicateOf,
    };
  });

  const failed = rows.filter((r) => r.error).length;
  const duplicates = rows.filter((r) => r.duplicateOf).length;

  return {
    rows,
    matched,
    ignored,
    missingNameColumn,
    totals: {
      total: rows.length,
      ready: rows.length - failed,
      failed,
      duplicates,
    },
    truncated,
  };
}

export type ImportResult = {
  created: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  failures: Array<{ line: number; name: string; reason: string }>;
};

/**
 * Creates the leads. Re-runs the preview server-side rather than trusting
 * anything the browser sends back, so what gets written is always validated
 * against the current stage list and the current contents of the CRM.
 *
 * Not a single transaction: better-sqlite3 transactions are synchronous and
 * createLead is async (it also writes an activity row per lead). Rows are
 * therefore independent — a failure part-way leaves the earlier leads in place,
 * and the caller is told exactly which lines didn't make it.
 */
export async function commitLeadImport(
  csvText: string,
  orgId: string,
  actor: LeadActor,
  options: { skipDuplicates: boolean },
): Promise<ImportResult> {
  const preview = await previewLeadImport(csvText, orgId);
  const deskId = await firstDeskId(orgId);

  const result: ImportResult = {
    created: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    failures: [],
  };

  for (const row of preview.rows) {
    if (row.error) {
      result.skippedInvalid++;
      continue;
    }
    if (options.skipDuplicates && row.duplicateOf) {
      result.skippedDuplicates++;
      continue;
    }

    try {
      const id = await createLead({
        orgId,
        actor,
        data: {
          name: row.name,
          company: row.company,
          email: row.email,
          phone: row.phone,
          source: row.source,
          purpose: row.purpose,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          country: row.country,
          stageId: row.stageId,
          estimatedValue: row.estimatedValue,
          followUpAt: row.followUpAt,
          notes: row.notes,
        },
      });
      // Imported leads are here to be worked, so put them on the first desk
      // (Telecalling) rather than leaving them with no desk at all.
      if (deskId) {
        await setLeadDesk(id, orgId, deskId, actor, { silent: true }).catch(() => {});
      }
      result.created++;
    } catch (err) {
      result.failures.push({
        line: row.line,
        name: row.name,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}

/** Rows that couldn't be imported, as CSV, so the user can fix and retry. */
export function rejectedRowsCsv(preview: ImportPreview): string | null {
  const bad = preview.rows.filter((r) => r.error);
  if (bad.length === 0) return null;
  const lines = ["Row,Name,Email,Phone,Problem"];
  for (const r of bad) {
    lines.push(
      [r.line, r.name, r.email ?? "", r.phone ?? "", r.error ?? ""]
        .map((v) => {
          const s = String(v);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    );
  }
  return lines.join("\r\n");
}
