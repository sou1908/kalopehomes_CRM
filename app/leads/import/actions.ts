"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { LEAD_SURFACE_ROLES } from "@/lib/roles";
import {
  previewLeadImport,
  commitLeadImport,
  MAX_IMPORT_BYTES,
  type ImportPreview,
  type ImportResult,
} from "@/lib/lead-import";

export type PreviewState =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

export type CommitState =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string };

function tooBig(csvText: string): boolean {
  // Rough byte count — server actions have their own body limit, and this
  // gives a clearer message than hitting it.
  return csvText.length > MAX_IMPORT_BYTES;
}

/** Reads and checks the file without writing anything. */
export async function previewImportAction(csvText: string): Promise<PreviewState> {
  const user = await requireRole([...LEAD_SURFACE_ROLES]);
  if (!user.orgId) return { ok: false, error: "No organization found for your account." };
  if (!csvText.trim()) return { ok: false, error: "That file is empty." };
  if (tooBig(csvText))
    return {
      ok: false,
      error: "That file is over 1 MB. Split it into smaller batches and import them one at a time.",
    };

  try {
    return { ok: true, preview: await previewLeadImport(csvText, user.orgId) };
  } catch {
    return {
      ok: false,
      error: "Couldn't read that file. Make sure it's a CSV saved from your spreadsheet.",
    };
  }
}

/** Creates the leads. Re-validates server-side; the browser is not trusted. */
export async function commitImportAction(
  csvText: string,
  skipDuplicates: boolean,
): Promise<CommitState> {
  const user = await requireRole([...LEAD_SURFACE_ROLES]);
  if (!user.orgId) return { ok: false, error: "No organization found for your account." };
  if (!csvText.trim()) return { ok: false, error: "That file is empty." };
  if (tooBig(csvText))
    return {
      ok: false,
      error: "That file is over 1 MB. Split it into smaller batches and import them one at a time.",
    };

  try {
    const result = await commitLeadImport(
      csvText,
      user.orgId,
      { userId: user.id, name: user.name },
      { skipDuplicates },
    );
    revalidatePath("/leads");
    revalidatePath("/leads/all");
    return { ok: true, result };
  } catch {
    return { ok: false, error: "The import failed. No further leads were created." };
  }
}
