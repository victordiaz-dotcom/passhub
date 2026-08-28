import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        "ink-soft": "#3C4656",
        paper: "#F3F5F1",
        card: "#FFFFFF",
        line: "#DCDFD9",
        accent: "#1F7A6C",
        "accent-tint": "#E4F1EE",
        "accent-dark": "#0F5548",
        warn: "#C97A2B",
        "warn-tint": "#FBEEE0",
        danger: "#B3392C",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
