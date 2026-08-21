/**
 * Line icons — one consistent 16px stroke set, drawn in `currentColor` so they
 * inherit text colour and both themes for free.
 *
 * These replace the emoji (🔔 💬 📈 👥 ⏰) the nav used to mix with geometric
 * glyphs (◫ ☰ ▣). Emoji render differently on every OS, force their own colour
 * into a restrained palette, and can't be sized or aligned reliably.
 */

export type IconName =
  | "board"
  | "list"
  | "user"
  | "clock"
  | "check"
  | "bell"
  | "chat"
  | "chart"
  | "users"
  | "sliders"
  | "plus"
  | "menu"
  | "close"
  | "chevronLeft"
  | "chevronRight"
  | "arrowUpRight"
  | "upload"
  | "search"
  | "funnel"
  | "phone"
  | "whatsapp";

const PATHS: Record<IconName, React.ReactNode> = {
  // Three columns — the pipeline board.
  board: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  list: <path d="M4 7h16M4 12h16M4 17h10" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 1.9" />
    </>
  ),
  check: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.4l2.6 2.6L16.2 9.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5.2-1.8 6.5-1.8 6.5h15.6S18 14.2 18 9Z" />
      <path d="M10.2 19a2 2 0 0 0 3.6 0" />
    </>
  ),
  chat: <path d="M20 12.2a7 7 0 0 1-7 7H8.6L4 22v-4.6a7 7 0 0 1 4.6-12.2h4.4a7 7 0 0 1 7 7Z" />,
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M7.5 15.2l3.4-4.4 3 2.4 3.6-5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3" />
      <path d="M3.8 19.5a5.7 5.7 0 0 1 11.4 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19.5a5.9 5.9 0 0 0-1.8-4.2" />
    </>
  ),
  // Settings / manage — sliders read more clearly than a gear at 16px.
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  chevronLeft: <path d="M14.5 6l-6 6 6 6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  arrowUpRight: <path d="M8 16.5L16.5 8M9 7.5h7.5V15" />,
  upload: (
    <>
      <path d="M12 15.5V4.5M8 8l4-3.5L16 8" />
      <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L20 20" />
    </>
  ),
  funnel: <path d="M4 5h16l-6.2 7.4v5.4l-3.6 1.8v-7.2L4 5Z" />,
  phone: (
    <path d="M7.6 4.5h-2A1.6 1.6 0 0 0 4 6.2c0 7.6 6.2 13.8 13.8 13.8a1.6 1.6 0 0 0 1.7-1.6v-2a1.2 1.2 0 0 0-1-1.2l-2.6-.5a1.2 1.2 0 0 0-1.2.5l-.8 1.1a11.6 11.6 0 0 1-5.7-5.7l1.1-.8a1.2 1.2 0 0 0 .5-1.2l-.5-2.6a1.2 1.2 0 0 0-1.2-1Z" />
  ),
  // The WhatsApp mark, drawn in strokes to sit with the rest of the set rather
  // than pasted in as a filled brand logo. Bubble with its tail, and the same
  // handset as `phone` scaled to fit inside it.
  whatsapp: (
    <>
      <path d="M12 3.75a8.25 8.25 0 0 0-7.06 12.57L3.75 20.25l3.99-1.12A8.25 8.25 0 1 0 12 3.75Z" />
      <path d="M9.9 9.05h-.6a1 1 0 0 0-1 1c0 2.9 2.35 5.25 5.25 5.25a1 1 0 0 0 1-1v-.6a.7.7 0 0 0-.6-.7l-1.15-.2a.7.7 0 0 0-.7.3l-.3.42a6.6 6.6 0 0 1-2.5-2.5l.42-.3a.7.7 0 0 0 .3-.7l-.2-1.15a.7.7 0 0 0-.7-.6Z" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
