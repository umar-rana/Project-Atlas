import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const tokenColor = (name: string) => `var(--${name})`;

const surfaces = {
  base: tokenColor("surface-base"),
  raised: tokenColor("surface-raised"),
  overlay: tokenColor("surface-overlay"),
  sunken: tokenColor("surface-sunken"),
  hover: tokenColor("surface-hover"),
  active: tokenColor("surface-active"),
  selected: tokenColor("surface-selected"),
  "selected-hover": tokenColor("surface-selected-hover"),
  "scrim-modal": tokenColor("scrim-modal"),
  "scrim-drawer": tokenColor("scrim-drawer"),
};

const borders = {
  subtle: tokenColor("border-subtle"),
  default: tokenColor("border-default"),
  strong: tokenColor("border-strong"),
  focus: tokenColor("border-focus"),
  error: tokenColor("border-error"),
};

const texts = {
  primary: tokenColor("text-primary"),
  secondary: tokenColor("text-secondary"),
  tertiary: tokenColor("text-tertiary"),
  disabled: tokenColor("text-disabled"),
  "on-accent": tokenColor("text-on-accent"),
  "on-emphasis": tokenColor("text-on-emphasis"),
  link: tokenColor("text-link"),
  "link-hover": tokenColor("text-link-hover"),
};

const accents = {
  primary: tokenColor("accent-primary"),
  "primary-hover": tokenColor("accent-primary-hover"),
  "primary-active": tokenColor("accent-primary-active"),
  "primary-muted": tokenColor("accent-primary-muted"),
  "primary-subtle": tokenColor("accent-primary-subtle"),
  success: tokenColor("accent-success"),
  "success-muted": tokenColor("accent-success-muted"),
  warning: tokenColor("accent-warning"),
  "warning-muted": tokenColor("accent-warning-muted"),
  danger: tokenColor("accent-danger"),
  "danger-muted": tokenColor("accent-danger-muted"),
  info: tokenColor("accent-info"),
  "info-muted": tokenColor("accent-info-muted"),
  neutral: tokenColor("accent-neutral"),
  "neutral-muted": tokenColor("accent-neutral-muted"),
};

const status = {
  active: tokenColor("status-active"),
  pending: tokenColor("status-pending"),
  "on-hold": tokenColor("status-on-hold"),
  blocked: tokenColor("status-blocked"),
  complete: tokenColor("status-complete"),
  cancelled: tokenColor("status-cancelled"),
  archived: tokenColor("status-archived"),
};

const viz = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => i + 1).flatMap((n) => [
    [`${n}`, tokenColor(`viz-${n}`)],
    [`${n}-light`, tokenColor(`viz-${n}-light`)],
    [`${n}-strong`, tokenColor(`viz-${n}-strong`)],
  ]),
);

const cal = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
    [`${n}-fill`, tokenColor(`cal-${n}-fill`)],
    [`${n}-soft`, tokenColor(`cal-${n}-soft`)],
    [`${n}-border`, tokenColor(`cal-${n}-border`)],
  ]),
);

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      mobile: "600px",
      tablet: "900px",
      laptop: "1200px",
      desktop: "1440px",
    },
    extend: {
      colors: {
        surface: surfaces,
        border: borders,
        text: texts,
        accent: accents,
        status,
        viz,
        cal,
      },
      borderColor: {
        DEFAULT: tokenColor("border-default"),
        subtle: tokenColor("border-subtle"),
        strong: tokenColor("border-strong"),
        focus: tokenColor("border-focus"),
        error: tokenColor("border-error"),
      },
      backgroundColor: {
        DEFAULT: tokenColor("surface-base"),
      },
      textColor: {
        DEFAULT: tokenColor("text-primary"),
      },
      fontFamily: {
        ui: ["var(--font-ui)", "system-ui", "sans-serif"],
        sans: ["var(--font-ui)", "system-ui", "sans-serif"],
        reading: ["var(--font-reading)", "Georgia", "serif"],
        serif: ["var(--font-reading)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "4xs": ["var(--text-4xs)", { lineHeight: "1" }],
        "3xs": ["var(--text-3xs)", { lineHeight: "var(--lh-2xs)" }],
        "2xs": ["var(--text-2xs)", { lineHeight: "var(--lh-2xs)", letterSpacing: "var(--tracking-caps)" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--lh-xs)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--lh-sm)" }],
        base: ["var(--text-base)", { lineHeight: "var(--lh-base)" }],
        md: ["var(--text-md)", { lineHeight: "var(--lh-md)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--lh-lg)", letterSpacing: "var(--tracking-tight)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--lh-xl)", letterSpacing: "var(--tracking-tight)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--lh-2xl)", letterSpacing: "var(--tracking-tight)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--lh-3xl)", letterSpacing: "var(--tracking-tight)" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "var(--lh-4xl)", letterSpacing: "-0.02em" }],
      },
      fontWeight: {
        regular: "var(--weight-regular)",
        medium: "var(--weight-medium)",
        semibold: "var(--weight-semibold)",
        bold: "var(--weight-bold)",
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        normal: "var(--tracking-normal)",
        wide: "var(--tracking-wide)",
        caps: "var(--tracking-caps)",
      },
      spacing: {
        0: "var(--space-0)",
        px: "var(--space-px)",
        "0.5": "var(--space-0_5)",
        1: "var(--space-1)",
        "1.25": "var(--space-1_25)",
        "1.5": "var(--space-1_5)",
        2: "var(--space-2)",
        "2.5": "var(--space-2_5)",
        3: "var(--space-3)",
        "3.5": "var(--space-3_5)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
        20: "var(--space-20)",
        24: "var(--space-24)",
        // Pixel-precise component heights (Stratum's components.css).
        // Aliased to the named --size-control-* tokens so theming can shift
        // the entire control scale in lockstep.
        "control-pill": "var(--size-control-pill)",
        "control-sm": "var(--size-control-sm)",
        "control-input": "var(--size-control-input)",
        "control-md": "var(--size-control-md)",
        "control-input-md": "var(--size-control-input-md)",
        "control-lg": "var(--size-control-lg)",
        "control-xl": "var(--size-control-xl)",
        // Numeric mirrors used by callers like `h-22`, `h-28`, `h-30`, etc.
        // Keys that collide with the spacing token scale (e.g. 24 = 96px)
        // are intentionally omitted — use `h-control-input` instead.
        "18": "var(--size-control-pill)",
        "22": "var(--size-control-sm)",
        "26": "26px",
        "28": "var(--size-control-md)",
        "30": "var(--size-control-input-md)",
        "36": "var(--size-control-lg)",
        "38": "var(--size-control-xl)",
      },
      minWidth: {
        "2": "var(--space-2)",
        "3": "var(--space-3)",
        "4": "var(--space-4)",
        "5": "var(--space-5)",
        menu: "var(--menu-min-w)",
        "menu-select": "var(--menu-min-w-select)",
      },
      minHeight: {
        textarea: "var(--textarea-min-h)",
      },
      maxHeight: {
        "menu-cmd": "var(--menu-max-h-cmd)",
        "autocomplete": "var(--autocomplete-max-h)",
      },
      maxWidth: {
        "modal-sm": "var(--modal-w-sm)",
        "modal-md": "var(--modal-w-md)",
        "modal-lg": "var(--modal-w-lg)",
        "modal-xl": "var(--modal-w-xl)",
        "modal-alert": "var(--modal-w-alert)",
        "modal-cmd": "var(--modal-w-cmd)",
        "empty-state": "var(--empty-state-max)",
        paragraph: "var(--reading-paragraph-max)",
        reading: "var(--reading-max-width)",
        "top-bar-search": "var(--top-bar-search-max-w)",
      },
      width: {
        "modal-base": "var(--modal-w-base)",
        "progress-indet": "var(--progress-indet-w)",
        "switch-track-sm": "var(--switch-track-w-sm)",
        "switch-track-md": "var(--switch-track-w-md)",
        "autocomplete": "var(--autocomplete-w)",
      },
      height: {
        "skeleton-block": "var(--skeleton-block-h)",
      },
      inset: {
        "modal-top": "var(--modal-inset-top)",
        "modal-top-cmd": "var(--modal-inset-top-cmd)",
      },
      borderWidth: {
        "1.5": "1.5px",
        "2.5": "2.5px",
      },
      backdropBlur: {
        overlay: "var(--backdrop-blur-overlay)",
      },
      zIndex: {
        base: "var(--z-base)",
        rail: "var(--z-rail)",
        "top-bar": "var(--z-top-bar)",
        overlay: "var(--z-overlay)",
        "drawer-backdrop": "var(--z-drawer-backdrop)",
        drawer: "var(--z-drawer)",
        "modal-backdrop": "var(--z-modal-backdrop)",
        "modal-content": "var(--z-modal-content)",
        toast: "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },
      borderRadius: {
        none: "var(--radius-none)",
        xs: "var(--radius-xs)",
        "2xs": "var(--radius-2xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        DEFAULT: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        0: "var(--shadow-0)",
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
        4: "var(--shadow-4)",
        5: "var(--shadow-5)",
        ring: "var(--ring-focus)",
        "ring-input": "var(--ring-input)",
        "ring-input-error": "var(--ring-input-error)",
        "ring-card-selected": "var(--ring-card-selected)",
      },
      transitionDuration: {
        instant: "var(--motion-instant)",
        fast: "var(--motion-fast)",
        medium: "var(--motion-medium)",
        slow: "var(--motion-slow)",
        deliberate: "var(--motion-deliberate)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        spring: "var(--ease-spring)",
      },
      keyframes: {
        "atlas-spin": { to: { transform: "rotate(360deg)" } },
        "atlas-skeleton-pulse": {
          "0%, 100%": { opacity: "var(--skeleton-shimmer-min)" },
          "50%": { opacity: "var(--skeleton-shimmer-max)" },
        },
        "atlas-fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "atlas-modal-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "atlas-drawer-in-r": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "atlas-drawer-in-l": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "atlas-indet": { "0%": { left: "-30%" }, "100%": { left: "100%" } },
      },
      animation: {
        "atlas-spin": "atlas-spin 700ms linear infinite",
        "atlas-skeleton-pulse": "atlas-skeleton-pulse 1.4s ease-in-out infinite",
        "atlas-fade-in": "atlas-fade-in var(--motion-medium) var(--ease-standard)",
        "atlas-modal-in": "atlas-modal-in var(--motion-medium) var(--ease-standard)",
        "atlas-drawer-in-r": "atlas-drawer-in-r var(--motion-slow) var(--ease-standard)",
        "atlas-drawer-in-l": "atlas-drawer-in-l var(--motion-slow) var(--ease-standard)",
        "atlas-indet": "atlas-indet 1.4s linear infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    plugin(({ addUtilities }) => {
      addUtilities({
        ".tabular-nums": {
          fontFeatureSettings: '"tnum", "ss01"',
          fontVariantNumeric: "tabular-nums",
        },
        ".focus-ring": {
          outline: "none",
          boxShadow: "var(--ring-focus)",
          borderRadius: "var(--radius-sm)",
        },
      });
    }),
  ],
};

export default config;
