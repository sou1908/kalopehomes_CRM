import "server-only";
import { nanoid } from "nanoid";
import { and, asc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { chatMessages, dmReads, users } from "./db/schema";
import type { ChatMessage } from "./db/schema";

const MAX_BODY = 4000;

// ── Team room (org-wide; recipient_user_id IS NULL) ─────────────────────────────

/** Messages in the org's team room, oldest → newest, capped at `limit`. */
export async function listChatMessages(
  orgId: string,
  limit = 200,
): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(
      and(eq(chatMessages.orgId, orgId), isNull(chatMessages.recipientUserId)),
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}

/** Post a message to the org room (and mark the sender caught-up). */
export async function postChatMessage(
  orgId: string,
  author: { id: string; name: string },
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  await db.insert(chatMessages).values({
    id: nanoid(21),
    orgId,
    userId: author.id,
    authorName: author.name,
    body: trimmed.slice(0, MAX_BODY),
  });
  await markChatRead(author.id);
}

/** Move a user's team-room "last read" pointer to now (clears the badge). */
export async function markChatRead(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ lastChatReadAt: new Date() })
    .where(eq(users.id, userId));
}

/** Count of team-room messages from others newer than the user's last-read time. */
export async function unreadChatCount(
  orgId: string,
  userId: string,
  lastReadAt: Date | null | undefined,
): Promise<number> {
  const since = new Date(lastReadAt ? lastReadAt.getTime() : 0);
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.orgId, orgId),
        isNull(chatMessages.recipientUserId),
        gt(chatMessages.createdAt, since),
        ne(chatMessages.userId, userId),
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

// ── Direct messages (1:1; recipient_user_id set) ────────────────────────────────

/** The DM thread between `meId` and `peerId`, oldest → newest. */
export async function listDirectMessages(
  orgId: string,
  meId: string,
  peerId: string,
  limit = 200,
): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.orgId, orgId),
        or(
          and(
            eq(chatMessages.userId, meId),
            eq(chatMessages.recipientUserId, peerId),
          ),
          and(
            eq(chatMessages.userId, peerId),
            eq(chatMessages.recipientUserId, meId),
          ),
        ),
      ),
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}

/**
 * Send a DM from `author` to `peerId`. Verifies the peer is a real account in
 * the same org. Returns false (no-op) on an empty body or unknown peer.
 */
export async function postDirectMessage(
  orgId: string,
  author: { id: string; name: string },
  peerId: string,
  body: string,
): Promise<boolean> {
  const trimmed = body.trim();
  if (!trimmed || !peerId || peerId === author.id) return false;
  const peer = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, peerId), eq(users.orgId, orgId)))
    .limit(1);
  if (peer.length === 0) return false;

  await db.insert(chatMessages).values({
    id: nanoid(21),
    orgId,
    userId: author.id,
    recipientUserId: peerId,
    authorName: author.name,
    body: trimmed.slice(0, MAX_BODY),
  });
  await markDmRead(author.id, peerId);
  return true;
}

/** Mark a 1:1 conversation read up to now for `userId`. */
export async function markDmRead(userId: string, peerId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(dmReads)
    .values({ userId, peerUserId: peerId, lastReadAt: now })
    // MySQL's spelling of upsert. It keys off the primary key
    // (user_id, peer_user_id) rather than naming the columns.
    .onDuplicateKeyUpdate({ set: { lastReadAt: now } });
}

/**
 * Unread DM count per sender for `meId` — { senderUserId: count } for messages
 * addressed to me that arrived after I last read that conversation.
 */
export async function dmUnreadByPeer(
  orgId: string,
  meId: string,
): Promise<Record<string, number>> {
  const reads = await db
    .select()
    .from(dmReads)
    .where(eq(dmReads.userId, meId));
  const readMap = new Map(reads.map((r) => [r.peerUserId, r.lastReadAt.getTime()]));

  const rows = await db
    .select({ sender: chatMessages.userId, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.orgId, orgId),
        eq(chatMessages.recipientUserId, meId),
      ),
    );

  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.sender) continue;
    const since = readMap.get(r.sender) ?? 0;
    if (r.createdAt.getTime() > since) {
      out[r.sender] = (out[r.sender] ?? 0) + 1;
    }
  }
  return out;
}

/** Total unread DMs across all conversations, for the sidebar badge. */
export async function totalUnreadDm(orgId: string, meId: string): Promise<number> {
  const byPeer = await dmUnreadByPeer(orgId, meId);
  return Object.values(byPeer).reduce((a, b) => a + b, 0);
}
