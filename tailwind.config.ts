import type { Config } from "tailwindcss";

/**
 * Every themeable colour resolves to a CSS variable holding space-separated RGB
 * channels (e.g. `--c-panel: 17 17 20`), defined per colour scheme in
 * app/globals.css. The `<alpha-value>` placeholder is what keeps Tailwind's
 * opacity modifiers working — `bg-panel/40`, `border-danger/40` and friends are
 * used ~80 times across the app and would silently break without it.
 */
const themed = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces, from furthest back to closest:
        //   sunken   — chrome that recedes (sidebar, rails, mobile header)
        //   bg       — the page
        //   panel    — cards, inputs, popovers
        //   elevated — pills and hover states that lift off a panel
        bg: themed("--c-bg"),
        panel: themed("--c-panel"),
        elevated: themed("--c-elevated"),
        sunken: themed("--c-sunken"),
        border: themed("--c-border"),
        muted: themed("--c-muted"),
        text: themed("--c-text"),
        // `accent` is the fill (buttons, chips — always paired with text-black).
        // `accentInk` is the same orange as *text*, darkened in light mode so it
        // clears WCAG AA against a pale background; identical to accent in dark.
        accent: themed("--c-accent"),
        accentInk: themed("--c-accent-ink"),
        accentHover: themed("--c-accent-hover"),
        accentSoft: themed("--c-accent-soft"),
        danger: themed("--c-danger"),
        success: themed("--c-success"),
        marigold: themed("--c-marigold"),
        sage: themed("--c-sage"),
        clay: themed("--c-clay"),
        slate: themed("--c-slate"),
        // Editorial palette — static on purpose. These are referenced only by
        // the legacy `.editorial` block in globals.css, which no component
        // currently renders. Theme them if that styling is ever revived.
        paper: "#efe6d3",
        "paper-soft": "#d7cdb8",
        "paper-muted": "#8c8170",
        ink: "#0c0a07",
        "ink-soft": "#16120c",
        "ink-panel": "#1c1812",
        rule: "#2b251c",
        "rule-soft": "#211c15",
        "marigold-deep": "#b56a2f",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Newsreader", "Georgia", "serif"],
        serif: ["Source Serif 4", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
