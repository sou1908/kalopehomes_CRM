"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { availableSurfaces, type Role } from "@/lib/roles-shared";
import {
  formatValue,
  type PipelineInfo,
  type LeadStageInfo,
  type LeadSummary,
} from "@/lib/leads-shared";
import type { Presence } from "@/lib/presence-shared";
import { LeadComposer } from "./lead-composer";
import { Icon, type IconName } from "@/app/_components/icons";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-mono text-sm">
      <span className="inline-block h-2 w-2 rounded-full bg-accent" />
      Kalope <span className="text-accentInk">Homes</span>
    </Link>
  );
}

export function LeadsSidebar({
  user,
  summary,
  stages,
  pipelines = [],
  attentionCount,
  todoCount = 0,
  inboxCount = 0,
  chatCount = 0,
}: {
  user: { id: string; name: string; email: string; roles: Role[]; presence: Presence };
  summary: LeadSummary;
  stages: LeadStageInfo[];
  pipelines?: PipelineInfo[];
  attentionCount: number;
  todoCount?: number;
  inboxCount?: number;
  chatCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStage = searchParams.get("stage");
  const activeFilter = searchParams.get("filter");
  const activeOwner = searchParams.get("owner");
  const surfaces = availableSurfaces(user.roles).filter((s) => s.href !== "/leads");

  // New leads start in the first pipeline, so that's the only stage set the
  // composer may offer. Falls back to everything if pipelines aren't set up.
  const entryPipelineId = pipelines[0]?.id ?? null;
  const composerStages = entryPipelineId
    ? stages.filter((st) => st.pipelineId === entryPipelineId)
    : stages;

  const [open, setOpen] = useState(false);
  // Close the mobile drawer whenever the route or query changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname, searchParams]);

  // Desktop collapse — remembered across sessions.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("kalope:sidebar-collapsed") === "1");
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("kalope:sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-sunken px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:text-text"
        >
          <Icon name="menu" size={17} />
        </button>
        <Logo />
        <LeadComposer
          stages={composerStages}
          triggerClassName="btn-primary px-3 py-1.5 text-xs"
          triggerLabel="＋ Lead"
        />
      </div>

      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r border-border bg-sunken transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${
          collapsed
            ? "lg:hidden"
            : "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-60 lg:translate-x-0 lg:self-start"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Logo />
          {/* Desktop collapse */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden text-muted transition-colors hover:text-text lg:inline-flex"
          >
            <Icon name="chevronLeft" size={15} />
          </button>
          {/* Mobile close */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-muted transition-colors hover:text-text lg:hidden"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="px-3 py-3">
          <LeadComposer
            stages={composerStages}
            triggerClassName="btn-primary w-full text-sm"
            triggerLabel="＋  New lead"
          />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <SideLink
          href="/leads"
          icon="board"
          label="Pipeline"
          active={pathname === "/leads"}
        />
        <SideLink
          href="/leads/all"
          icon="list"
          label="All leads"
          badge={summary.total}
          active={pathname === "/leads/all" && !activeStage && !activeFilter && !activeOwner}
        />
        <SideLink
          href="/leads/all?owner=me"
          icon="user"
          label="My leads"
          active={pathname === "/leads/all" && activeOwner === "me"}
        />
        <SideLink
          href="/leads/import"
          icon="upload"
          label="Import leads"
          active={pathname.startsWith("/leads/import")}
        />
        <SideLink
          href="/leads/all?filter=attention"
          icon="clock"
          label="Needs attention"
          badge={attentionCount}
          badgeTone={attentionCount > 0 ? "alert" : undefined}
          active={pathname === "/leads/all" && activeFilter === "attention"}
        />
        <SideLink
          href="/leads/todos"
          icon="check"
          label="My to-dos"
          badge={todoCount}
          active={
            pathname === "/leads/todos" &&
            !["personal", "tome", "assigned"].includes(activeFilter ?? "")
          }
        />
        <div className="my-0.5 ml-[18px] space-y-0.5 border-l border-border pl-2">
          <SubLink
            href="/leads/todos?filter=personal"
            label="Personal"
            active={pathname === "/leads/todos" && activeFilter === "personal"}
          />
          <SubLink
            href="/leads/todos?filter=tome"
            label="Assigned to me"
            active={pathname === "/leads/todos" && activeFilter === "tome"}
          />
          <SubLink
            href="/leads/todos?filter=assigned"
            label="Assigned"
            active={pathname === "/leads/todos" && activeFilter === "assigned"}
          />
        </div>
        <SideLink
          href="/leads/inbox"
          icon="bell"
          label="Inbox"
          badge={inboxCount}
          badgeTone={inboxCount > 0 ? "alert" : undefined}
          active={pathname === "/leads/inbox"}
        />
        <SideLink
          href="/leads/team"
          icon="chat"
          label="Team room"
          badge={chatCount}
          badgeTone={chatCount > 0 ? "alert" : undefined}
          active={pathname.startsWith("/leads/team")}
        />
        {user.roles.includes("admin") && (
          <SideLink
            href="/leads/analytics"
            icon="chart"
            label="Analytics"
            active={pathname === "/leads/analytics"}
          />
        )}
        {user.roles.includes("admin") && (
          <SideLink
            href="/dashboard/members"
            icon="users"
            label="Members"
            active={pathname.startsWith("/dashboard/members")}
          />
        )}

        {/* No Pipelines list here. The board header carries the same switcher,
            directly above the board it switches — and switching pipeline is
            something you do while looking at it, not from across the page.
            Two controls doing one job is what this removes. Managing them
            lives beside that switcher too, for admins. */}

        {user.roles.includes("admin") && (
          <>
            <div className="flex items-center justify-between px-3 pb-1.5 pt-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Stages
              </span>
              <Link
                href="/leads/stages"
                className="text-muted transition-colors hover:text-accentInk"
                title="Manage stages"
              >
                <Icon name="sliders" size={14} />
              </Link>
            </div>
            {pipelines.map((p) => {
              const own = stages.filter((st) => st.pipelineId === p.id);
              if (own.length === 0) return null;
              return (
                <div key={p.id} className="mb-1">
                  <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[11px] text-muted">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </div>
                  {own.map((stage) => (
                    <StageLink
                      key={stage.id}
                      stage={stage}
                      count={summary.byStage[stage.id] ?? 0}
                      active={pathname === "/leads/all" && activeStage === stage.id}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}

        <div className="px-3 pb-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Overview
        </div>
        <Stat label="Open pipeline" value={formatValue(summary.openValue) ?? "₹0"} />
        <Stat label="Won value" value={formatValue(summary.wonValue) ?? "₹0"} />
        <Stat
          label="Conversion"
          value={`${Math.round(summary.conversionRate * 100)}%`}
        />

        {surfaces.length > 0 && (
          <>
            <div className="px-3 pb-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Switch
            </div>
            {surfaces.map((s) => (
              <SideLink key={s.role} href={s.href} icon="arrowUpRight" label={s.label} />
            ))}
          </>
        )}
      </nav>

      </aside>

      {/* Collapsed icon rail (desktop only) */}
      <aside
        className={`hidden w-16 shrink-0 flex-col items-center border-r border-border bg-sunken lg:sticky lg:top-0 lg:h-screen lg:self-start ${
          collapsed ? "lg:flex" : "lg:hidden"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="mt-3 flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel hover:text-text"
        >
          <Icon name="chevronRight" size={15} />
        </button>

        <LeadComposer
          stages={composerStages}
          triggerClassName="mt-2 flex h-9 w-9 items-center justify-center rounded-md bg-accent text-lg font-semibold text-black hover:bg-accentHover"
          triggerLabel="＋"
        />

        <nav className="no-scrollbar mt-3 flex flex-1 flex-col items-center gap-1 overflow-y-auto pb-3">
          <RailIcon href="/leads" icon="board" label="Pipeline" active={pathname === "/leads"} />
          <RailIcon
            href="/leads/all"
            icon="list"
            label="All leads"
            active={
              pathname === "/leads/all" &&
              !activeStage &&
              !activeFilter &&
              !activeOwner
            }
          />
          <RailIcon
            href="/leads/all?owner=me"
            icon="user"
            label="My leads"
            active={pathname === "/leads/all" && activeOwner === "me"}
          />
          <RailIcon
            href="/leads/all?filter=attention"
            icon="clock"
            label="Needs attention"
            dot={attentionCount > 0}
            active={pathname === "/leads/all" && activeFilter === "attention"}
          />
          <RailIcon
            href="/leads/todos"
            icon="check"
            label="My to-dos"
            dot={todoCount > 0}
            active={pathname === "/leads/todos"}
          />
          <RailIcon
            href="/leads/inbox"
            icon="bell"
            label="Inbox"
            dot={inboxCount > 0}
            active={pathname === "/leads/inbox"}
          />
          <RailIcon
            href="/leads/team"
            icon="chat"
            label="Team room"
            dot={chatCount > 0}
            active={pathname.startsWith("/leads/team")}
          />
          {user.roles.includes("admin") && (
            <RailIcon
              href="/leads/analytics"
              icon="chart"
              label="Analytics"
              active={pathname === "/leads/analytics"}
            />
          )}
          {user.roles.includes("admin") && (
            <RailIcon
              href="/dashboard/members"
              icon="users"
              label="Members"
              active={pathname.startsWith("/dashboard/members")}
            />
          )}
        </nav>

      </aside>
    </>
  );
}

function RailIcon({
  href,
  icon,
  label,
  active,
  dot,
}: {
  href: string;
  icon: IconName;
  label: string;
  active?: boolean;
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-panel text-accentInk"
          : "text-muted hover:bg-panel hover:text-text"
      }`}
    >
      <Icon name={icon} size={17} />
      {dot && (
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
      )}
    </Link>
  );
}

function SideLink({
  href,
  icon,
  label,
  badge,
  badgeTone,
  active,
}: {
  href: string;
  icon: IconName;
  label: string;
  badge?: number;
  badgeTone?: "alert";
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-md py-1.5 pl-3 pr-2 text-sm transition-colors ${
        active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
      }`}
    >
      {/* The current section is marked on the edge, so the icon and label stay
          the same weight everywhere and the eye tracks one moving element. */}
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-accent" />
      )}
      <Icon
        name={icon}
        className={active ? "text-accentInk" : "text-muted group-hover:text-text"}
      />
      {label}
      {badge != null && badge > 0 && (
        <span
          className={`ml-auto rounded-full px-1.5 font-mono text-[10px] tabular-nums ${
            badgeTone === "alert" ? "bg-danger/15 text-danger" : "text-muted"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function SubLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-3 py-1 text-[13px] ${
        active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
}

function StageLink({
  stage,
  count,
  active,
}: {
  stage: LeadStageInfo;
  count: number;
  active?: boolean;
}) {
  return (
    <Link
      href={`/leads/all?stage=${stage.id}`}
      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
      }`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: stage.color }}
      />
      {stage.name}
      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
        {count}
      </span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-mono text-[13px] tabular-nums">{value}</span>
    </div>
  );
}
