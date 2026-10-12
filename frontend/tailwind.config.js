/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070b14",
          900: "#0b1120",
          850: "#0f172a",
          800: "#131d31",
          750: "#17233d",
          700: "#1e293b",
          600: "#334155",
        },
        clinical: {
          red: "#ef4444",
          "red-dark": "#b91c1c",
          amber: "#f59e0b",
          "amber-dark": "#b45309",
          green: "#10b981",
          "green-dark": "#047857",
          teal: "#14b8a6",
          "teal-light": "#2dd4bf",
          "teal-dark": "#0f766e",
          cyan: "#06b6d4",
          blue: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 15px -3px rgba(20, 184, 166, 0.15)",
        "glow-red": "0 0 15px -3px rgba(239, 68, 68, 0.25)",
        "glow-amber": "0 0 15px -3px rgba(245, 158, 11, 0.25)",
      },
    },
  },
  plugins: [],
};
