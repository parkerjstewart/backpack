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
        warning: "var(--warning)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      spacing: {
        "page": "var(--page-padding)",
        "section": "var(--section-gap)",
        "card-gap": "var(--card-gap)",
        "item": "var(--item-gap)",
      },
    },
  },
  plugins: [typography],
};

export default config;