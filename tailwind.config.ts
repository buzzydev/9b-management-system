import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        background: hsl("background"),
        foreground: hsl("foreground"),
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },
        popover: { DEFAULT: hsl("popover"), foreground: hsl("popover-foreground") },
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground") },
        secondary: { DEFAULT: hsl("secondary"), foreground: hsl("secondary-foreground") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        destructive: { DEFAULT: hsl("destructive"), foreground: hsl("destructive-foreground") },
        success: { DEFAULT: hsl("success"), foreground: hsl("success-foreground") },
        warning: { DEFAULT: hsl("warning"), foreground: hsl("warning-foreground") },
        info: { DEFAULT: hsl("info"), foreground: hsl("info-foreground") },
        brand: hsl("brand"),
        sidebar: {
          DEFAULT: hsl("sidebar"),
          foreground: hsl("sidebar-foreground"),
          muted: hsl("sidebar-muted"),
          border: hsl("sidebar-border"),
          accent: hsl("sidebar-accent"),
        },
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      boxShadow: {
        soft: "0 1px 2px hsl(var(--shadow) / 0.05), 0 10px 28px -14px hsl(var(--shadow) / 0.20)",
        card: "0 1px 1px hsl(var(--shadow) / 0.04), 0 2px 6px hsl(var(--shadow) / 0.05), 0 14px 32px -18px hsl(var(--shadow) / 0.22)",
        glow: "0 0 0 1px hsl(var(--ring) / 0.35), 0 10px 30px -8px hsl(var(--glow) / 0.45)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96) translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "sheet-up": { from: { opacity: "0.6", transform: "translateY(32px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-left": { from: { transform: "translateX(-24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in .25s cubic-bezier(.22,1,.36,1)",
        "fade-up": "fade-up .45s cubic-bezier(.22,1,.36,1) both",
        "scale-in": "scale-in .22s cubic-bezier(.22,1,.36,1)",
        "sheet-up": "sheet-up .28s cubic-bezier(.22,1,.36,1)",
        "slide-in-left": "slide-in-left .28s cubic-bezier(.22,1,.36,1)",
      },
    },
  },
  plugins: [animate],
};

export default config;
