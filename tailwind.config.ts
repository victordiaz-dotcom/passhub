import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d1d1f",
        "ink-soft": "#6c757d",
        paper: "#f4f6f9",
        card: "#ffffff",
        line: "#e9e9e9",
        accent: "#1873dc",
        "accent-tint": "#e6f1fc",
        "accent-dark": "#0e4381",
        warn: "#ff9800",
        "warn-tint": "#fdf3dc",
        danger: "#f44336",
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
