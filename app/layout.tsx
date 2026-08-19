import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kalope Homes CRM",
  description:
    "Kalope Homes lead CRM — pipeline, telecaller team, follow-ups and analytics in one place.",
};

/** Tints the mobile browser chrome to match whichever scheme the device is in. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

/**
 * Applies a pinned theme before first paint so a reload doesn't flash the other
 * scheme. Kept inline and dependency-free on purpose — it must run ahead of
 * hydration. No stored value means no attribute, which leaves globals.css to
 * follow the device preference. Key matches THEME_STORAGE_KEY in
 * app/_components/theme-toggle.tsx.
 */
const themeScript = `try{var t=localStorage.getItem("kalope-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script above mutates <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
