import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)"],
        sans: ["var(--font-sans)"],
      },
      colors: {
        sage: {
          300: "var(--sage-300)",
          500: "var(--sage-500)",
          700: "var(--sage-700)",
        },
        teal: {
          200: "var(--teal-200)",
          300: "var(--teal-300)",
          800: "var(--teal-800)",
        },
        success: "var(--success)",
        "success-fg": "var(--success-fg)",
        warning: "var(--warning)",
        "warning-fg": "var(--warning-fg)",
        info: "var(--info)",
        "info-fg": "var(--info-fg)",
        // Course card colors (from Figma variables)
        amber: {
          400: "var(--amber-400)",
          600: "var(--amber-600)",
        },
        sky: {
          500: "var(--sky-500)",
          700: "var(--sky-700)",
        },
        coral: {
          500: "var(--coral-500)",
          700: "var(--coral-700)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "var(--foreground)",
            "--tw-prose-links": "var(--info, #2563eb)",
            "--tw-prose-headings": "var(--primary)",
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;