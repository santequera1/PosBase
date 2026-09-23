import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Las fuentes se definen en tiempo de ejecución desde Ajustes → Marca (variables CSS)
        display: ['var(--font-heading)', 'Georgia', 'serif'],
        serif: ['var(--font-heading)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        script: ['var(--font-script)', 'cursive'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Paleta de marca configurable (Ajustes → Marca). Valores en src/index.css y src/lib/theme.ts
        brand: {
          bg: "hsl(var(--brand-bg) / <alpha-value>)",
          card: "hsl(var(--brand-card) / <alpha-value>)",
          "card-2": "hsl(var(--brand-card-2) / <alpha-value>)",
          pill: "hsl(var(--brand-pill) / <alpha-value>)",
          primary: "hsl(var(--brand-primary) / <alpha-value>)",
          "primary-strong": "hsl(var(--brand-primary-strong) / <alpha-value>)",
          dark: "hsl(var(--brand-dark) / <alpha-value>)",
          accent: "hsl(var(--brand-accent) / <alpha-value>)",
          muted: "hsl(var(--brand-muted) / <alpha-value>)",
          wine: "hsl(var(--brand-wine) / <alpha-value>)",
          "on-primary": "hsl(var(--brand-on-primary) / <alpha-value>)",
          "on-dark": "hsl(var(--brand-on-dark) / <alpha-value>)",
          "on-accent": "hsl(var(--brand-on-accent) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        delivery: {
          DEFAULT: "hsl(var(--delivery))",
          foreground: "hsl(var(--delivery-foreground))",
        },
        pickup: {
          DEFAULT: "hsl(var(--pickup))",
          foreground: "hsl(var(--pickup-foreground))",
        },
        "dine-in": {
          DEFAULT: "hsl(var(--dine-in))",
          foreground: "hsl(var(--dine-in-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
