import { requireRole } from "@/lib/auth";
import { listChatMessages, markChatRead } from "@/lib/chat";
import { listTeamPresence } from "@/lib/presence";
import { listLeadMentions } from "@/lib/leads";
import { ChatThread, type ChatMsg } from "./_components/chat-thread";
import { PresenceRoster, type RosterMember } from "./_components/presence-roster";
import { postChatAction } from "./actions";

export default async function TeamPage() {
  const user = await requireRole(["telecaller", "field_agent", "super_admin"]);
  if (!user.orgId) {
    return (
      <div className="px-6 py-10 text-sm text-muted">
        No organization found for your account.
      </div>
    );
  }

  const [rawMessages, roster, leads] = await Promise.all([
    listChatMessages(user.orgId),
    listTeamPresence(user.orgId),
    listLeadMentions(user.orgId),
  ]);
  // Opening the room marks the viewer caught up (clears their unread badge).
  await markChatRead(user.id);

  const messages: ChatMsg[] = rawMessages.map((m) => ({
    id: m.id,
    userId: m.userId,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.createdAt.getTime(),
  }));

  const members: RosterMember[] = roster.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    presence: m.presence,
    roles: m.roles,
  }));

  const isAdmin = user.roles.includes("super_admin");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">Team</div>
      <h1 className="text-2xl font-semibold tracking-tight">Team room</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Chat with the team and see who’s available.
        {isAdmin && " As Lead Manager you can set anyone’s status."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card flex h-[72vh] min-h-[420px] flex-col p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-medium">Team chat</h2>
            <span className="text-[11px] text-muted">{messages.length} messages</span>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread
              messages={messages}
              meId={user.id}
              action={postChatAction}
              leads={leads}
              placeholder="Message the team…"
            />
          </div>
        </section>

        <aside>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Team</h2>
            <span className="text-[11px] text-muted">{members.length}</span>
          </div>
          <PresenceRoster members={members} meId={user.id} isAdmin={isAdmin} />
          <p className="mt-2 px-1 text-[11px] text-muted">
            {isAdmin
              ? "Tap a status to update it — yours or anyone’s."
              : "Set your own status; the Lead Manager can update it too."}
          </p>
        </aside>
      </div>
    </div>
  );
}
