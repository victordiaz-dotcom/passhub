import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-tint": "rgb(var(--accent-tint) / <alpha-value>)",
        "accent-dark": "rgb(var(--accent-dark) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        "warn-tint": "rgb(var(--warn-tint) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Montserrat", "sans-serif"],
      },
      letterSpacing: {
        wide: "0.06em",
      },
    },
  },
  plugins: [],
} satisfies Config;
