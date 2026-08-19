import { requireRole } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { openNotificationAction, markAllReadAction } from "./actions";

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(d);
}

export default async function LeadsInboxPage() {
  const user = await requireRole(["telecaller", "site_agent", "admin"]);
  const items = await listNotifications(user.id);
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        {hasUnread && (
          <form action={markAllReadAction}>
            <button type="submit" className="btn-secondary text-xs">
              Mark all as read
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-muted">
          You’re all caught up. Assignments and updates will show up here.
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {items.map((n) => (
            <form key={n.id} action={openNotificationAction}>
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="link" value={n.link ?? ""} />
              <button
                type="submit"
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.readAt ? "bg-transparent" : "bg-accent"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${n.readAt ? "text-muted" : "font-medium"}`}>
                    {n.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {n.actorName ? `${n.actorName} · ` : ""}
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
