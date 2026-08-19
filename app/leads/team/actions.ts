"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { postChatMessage, postDirectMessage } from "@/lib/chat";
import { setPresence, setMemberPresence, PRESENCE_ORDER } from "@/lib/presence";
import type { Presence } from "@/lib/presence-shared";

const ROLES = ["telecaller", "field_agent", "super_admin"] as const;

export type ChatFormState = { ok?: boolean; error?: string } | undefined;

// Append picked lead references as canonical [[lead:ID]] tokens to the typed body.
function withLeadRefs(typed: string, formData: FormData): string {
  const refs = Array.from(
    new Set(
      formData
        .getAll("leadRefs")
        .map(String)
        .filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s)),
    ),
  ).slice(0, 10);
  if (refs.length === 0) return typed;
  const tokens = refs.map((id) => `[[lead:${id}]]`).join(" ");
  return typed ? `${typed}\n${tokens}` : tokens;
}

/** Post a message to the org team chat. */
export async function postChatAction(
  _prev: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const user = await requireRole([...ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const body = withLeadRefs(String(formData.get("body") ?? "").trim(), formData);
  if (!body) return { error: "Type a message or tag a lead first." };
  await postChatMessage(user.orgId, { id: user.id, name: user.name }, body);
  revalidatePath("/leads/team");
  return { ok: true };
}

/** Send a 1:1 direct message (recipientId carried in the form). */
export async function postDmAction(
  _prev: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const user = await requireRole([...ROLES]);
  if (!user.orgId) return { error: "No organization." };
  const recipientId = String(formData.get("recipientId") ?? "");
  const body = withLeadRefs(String(formData.get("body") ?? "").trim(), formData);
  if (!recipientId) return { error: "No recipient." };
  if (!body) return { error: "Type a message or tag a lead first." };
  const ok = await postDirectMessage(
    user.orgId,
    { id: user.id, name: user.name },
    recipientId,
    body,
  );
  if (!ok) return { error: "Couldn't send that message." };
  revalidatePath(`/leads/team/dm/${recipientId}`);
  revalidatePath("/leads/team");
  return { ok: true };
}

function parsePresence(raw: FormDataEntryValue | null): Presence | null {
  const s = String(raw ?? "");
  return (PRESENCE_ORDER as string[]).includes(s) ? (s as Presence) : null;
}

/**
 * Set availability. With no `userId` (or your own), updates yourself. Setting
 * someone else's status requires the Lead Manager (super_admin) role.
 */
export async function updatePresenceAction(formData: FormData) {
  const user = await requireRole([...ROLES]);
  if (!user.orgId) return;
  const presence = parsePresence(formData.get("presence"));
  if (!presence) return;
  const targetUserId = String(formData.get("userId") ?? "") || user.id;

  if (targetUserId === user.id) {
    await setPresence(user.id, presence);
  } else {
    // Only the Lead Manager can change another member's status.
    if (!user.roles.includes("super_admin")) return;
    await setMemberPresence(user.orgId, targetUserId, presence);
  }
  revalidatePath("/leads/team");
}
