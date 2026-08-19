import { requireRole } from "@/lib/auth";
import { listTeamPresence } from "@/lib/presence";
import { unreadChatCount, dmUnreadByPeer } from "@/lib/chat";
import {
  ConversationsRail,
  type ConversationPeer,
} from "./_components/conversations-rail";

export default async function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  if (!user.orgId) return <>{children}</>;

  const [roster, teamUnread, dmUnread] = await Promise.all([
    listTeamPresence(user.orgId),
    unreadChatCount(user.orgId, user.id, user.lastChatReadAt),
    dmUnreadByPeer(user.orgId, user.id),
  ]);

  const peers: ConversationPeer[] = roster
    .filter((m) => m.id !== user.id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      presence: m.presence,
      unread: dmUnread[m.id] ?? 0,
    }));

  return (
    <div className="lg:flex">
      <ConversationsRail peers={peers} teamUnread={teamUnread} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
