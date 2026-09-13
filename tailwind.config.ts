import type { Config } from "tailwindcss";

/** All tokens carry `<alpha-value>` so opacity modifiers (bg-primary/12) compile. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: token("border"),
        "border-hover": token("border-hover"),
        hairline: token("hairline"),
        input: {
          DEFAULT: token("input"),
          border: token("input-border"),
        },
        zone: token("zone"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),

        primary: {
          DEFAULT: token("primary"),
          hover: token("primary-hover"),
          foreground: token("primary-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        gold: {
          DEFAULT: token("gold"),
          hover: token("gold-hover"),
          foreground: token("gold-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        subtle: token("subtle-foreground"),
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        elevated: token("elevated"),

        /* Marketing surfaces — physical paper, readable in both themes */
        paper: {
          DEFAULT: token("paper"),
          ink: token("paper-ink"),
          muted: token("paper-muted"),
          line: token("paper-line"),
          placeholder: token("paper-placeholder"),
        },
        /* Full-bleed dramatic ground for the closing section */
        ink: token("ink-deep"),

        success: { DEFAULT: token("success"), foreground: token("success-foreground") },
        warning: { DEFAULT: token("warning"), foreground: token("warning-foreground") },
        danger: { DEFAULT: token("danger"), foreground: token("danger-foreground") },
        destructive: { DEFAULT: token("danger"), foreground: token("danger-foreground") },
        info: { DEFAULT: token("info"), foreground: token("info-foreground") },
      },

      /* Elevation — theme-aware, defined as CSS variables in globals.css.
         `soft` lifts a surface off the page; `lift` is for floating layers
         (menus, dialogs, sheets) that genuinely need an edge.            */
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
      },

      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        /* Tight grotesk — holds negative tracking at 8rem where a geometric
           face would fall apart. Falls back to the body face. */
        display: ["var(--font-display)", "var(--font-inter)", "sans-serif"],
        /* Editorial accent — used only on emphasised words */
        serif: ["var(--font-instrument-serif)", "Georgia", "serif"],
        /* Inter sits second so it supplies the naira sign, which JetBrains
           Mono lacks (see layout.tsx). */
        mono: ["var(--font-jetbrains-mono)", "var(--font-inter)", "ui-monospace", "monospace"],
      },

      /* Fluid editorial type scale — the page architecture */
      fontSize: {
        display: ["clamp(3.25rem, 9.5vw, 8.5rem)", { lineHeight: "0.9", letterSpacing: "-0.045em" }],
        /* Capped so the longest authored line in a 6-column heading still
           fits its column at the 1440 shell. Above that the line wraps and
           the authored break is lost — the scale is the thing that keeps
           the composition honest. */
        "display-sm": ["clamp(2.25rem, 5vw, 4.25rem)", { lineHeight: "0.96", letterSpacing: "-0.04em" }],
        headline: ["clamp(2rem, 4.4vw, 3.75rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        "headline-sm": ["clamp(1.5rem, 2.6vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        stat: ["clamp(2.5rem, 5.5vw, 4.5rem)", { lineHeight: "0.9", letterSpacing: "-0.04em" }],
        lead: ["clamp(1.0625rem, 1.35vw, 1.3125rem)", { lineHeight: "1.6", letterSpacing: "-0.01em" }],
        eyebrow: ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.12em" }],
        meta: ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.02em" }],
      },

      spacing: {
        /* Section rhythm */
        section: "clamp(5rem, 12vh, 9.5rem)",
        "section-lg": "clamp(7rem, 17vh, 14rem)",
        gutter: "clamp(1.25rem, 5vw, 5rem)",
      },

      maxWidth: {
        shell: "1440px",
        measure: "38ch",
        "measure-lg": "52ch",
      },

      /* Z-axis architecture. Every stacking decision resolves to one of
         these six planes — no 9999s anywhere in the codebase. */
      zIndex: {
        ground: "var(--z-ground)",
        atmosphere: "var(--z-atmosphere)",
        content: "var(--z-content)",
        media: "var(--z-media)",
        overlay: "var(--z-overlay)",
        nav: "var(--z-nav)",
        modal: "var(--z-modal)",
      },

      /* Named so components write `duration-normal`, never a raw arbitrary
         value. Arbitrary `duration-[var(--x)]` is ambiguous to Tailwind —
         it matches both transition- and animation-duration — and the named
         scale is the thing the design system was supposed to have anyway. */
      transitionDuration: {
        fast: "var(--motion-fast)",
        normal: "var(--motion-normal)",
        slow: "var(--motion-slow)",
        "400": "400ms",
        "450": "450ms",
        "600": "600ms",
      },

      transitionTimingFunction: {
        /* Decisive, no bounce */
        editorial: "var(--ease-editorial)",
        exit: "var(--ease-exit)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-10px,0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "float-slow": "float-slow 9s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
