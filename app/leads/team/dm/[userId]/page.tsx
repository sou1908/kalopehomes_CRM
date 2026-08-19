import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listDirectMessages, markDmRead } from "@/lib/chat";
import { listTeamPresence, presenceMeta } from "@/lib/presence";
import { listLeadMentions } from "@/lib/leads";
import { ROLE_LABELS, type Role } from "@/lib/roles-shared";
import { initials, colorFromName } from "@/lib/avatar";
import { ChatThread, type ChatMsg } from "../../_components/chat-thread";
import { PresenceDot } from "../../_components/presence-switcher";
import { postDmAction } from "../../actions";

function topRoleLabel(roles: Role[]): string {
  if (roles.includes("admin")) return ROLE_LABELS.admin;
  if (roles.includes("telecaller")) return ROLE_LABELS.telecaller;
  return roles[0] ? ROLE_LABELS[roles[0]] : "No role";
}

export default async function DmPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const { userId: peerId } = await params;
  if (!user.orgId || peerId === user.id) redirect("/leads/team");

  const roster = await listTeamPresence(user.orgId);
  const peer = roster.find((m) => m.id === peerId);
  // Unknown / non-staff target — back to the team room.
  if (!peer) redirect("/leads/team");

  const [rawMessages, leads] = await Promise.all([
    listDirectMessages(user.orgId, user.id, peerId),
    listLeadMentions(user.orgId),
  ]);
  // Opening the thread marks it read.
  await markDmRead(user.id, peerId);

  const messages: ChatMsg[] = rawMessages.map((m) => ({
    id: m.id,
    userId: m.userId,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.createdAt.getTime(),
  }));

  const meta = presenceMeta(peer.presence);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
      <Link href="/leads/team" className="text-xs text-muted hover:text-text lg:hidden">
        ← Messages
      </Link>
      <div className="mb-4 mt-2 flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: colorFromName(peer.id) }}
        >
          {initials(peer.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{peer.name}</h1>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <PresenceDot value={peer.presence} />
            {meta.label} · {topRoleLabel(peer.roles)}
          </div>
        </div>
      </div>

      <section className="card flex h-[72vh] min-h-[420px] flex-col p-4">
        <ChatThread
          messages={messages}
          meId={user.id}
          action={postDmAction}
          recipientId={peer.id}
          leads={leads}
          placeholder={`Message ${peer.name.split(" ")[0]}…`}
        />
      </section>
    </div>
  );
}
