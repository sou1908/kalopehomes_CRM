import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserWithRoles } from "@/lib/auth";
import { defaultSurface, LEAD_SURFACE_ROLES } from "@/lib/roles";
import { listLeads, listLeadStages } from "@/lib/leads";
import { listDesks } from "@/lib/desks";
import { summarize, followUpState } from "@/lib/leads-shared";
import { countActiveTodos } from "@/lib/todos";
import { unreadNotificationCount } from "@/lib/notifications";
import { unreadChatCount, totalUnreadDm } from "@/lib/chat";
import { runFollowUpDigest } from "@/lib/digest";
import type { Presence } from "@/lib/presence-shared";
import { LeadsSidebar } from "./_components/leads-sidebar";
import { ThemeToggle } from "@/app/_components/theme-toggle";

export default async function LeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserWithRoles();
  if (!user) redirect("/login");
  // Telecallers, field agents, and the Lead Manager all work this surface.
  if (!user.roles.some((r) => LEAD_SURFACE_ROLES.includes(r)))
    redirect(defaultSurface(user.roles));

  const [leads, stages, desks, todoCount, inboxCount, teamUnread, dmUnread] =
    user.orgId
      ? await Promise.all([
          listLeads(user.orgId),
          listLeadStages(user.orgId),
          listDesks(user.orgId),
          countActiveTodos(user.id),
          unreadNotificationCount(user.id),
          unreadChatCount(user.orgId, user.id, user.lastChatReadAt),
          totalUnreadDm(user.orgId, user.id),
          // Fire the daily follow-up digest (self-guarded to once per day).
          runFollowUpDigest(user.orgId).catch(() => null),
        ])
      : [[], [], [], 0, 0, 0, 0];
  const chatCount = teamUnread + dmUnread;
  const summary = summarize(leads, stages);

  // Open-stage leads whose follow-up is overdue or due soon = "needs attention".
  const openStageIds = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id));
  const now = Date.now();
  const attentionCount = leads.filter((l) => {
    if (!l.stageId || !openStageIds.has(l.stageId)) return false;
    const fu = followUpState(l.followUpAt, now);
    return fu === "overdue" || fu === "soon";
  }).length;

  return (
    <div className="min-h-screen lg:flex">
      <Suspense fallback={null}>
        <LeadsSidebar
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.roles,
            presence: (user.presence as Presence) ?? "offline",
          }}
          summary={summary}
          stages={stages}
          desks={desks}
          attentionCount={attentionCount}
          todoCount={todoCount}
          inboxCount={inboxCount}
          chatCount={chatCount}
        />
      </Suspense>
      <main className="min-w-0 flex-1">
        {/* Utility strip. In flow rather than floating over the page, because
            /leads/all and /leads/inbox both put controls in this same corner. */}
        <div className="flex justify-end px-4 pt-3 sm:px-8">
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}
