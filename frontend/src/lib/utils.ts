import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-hero",
        "text-section",
        "text-title",
        "text-card-title",
        "text-title-sm",
        "text-body",
        "text-body-sm",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert LaTeX delimiters `\(...\)` → `$...$` and `\[...\]` → `$$...$$`
 * so remark-math can parse them. Preserves the raw text for editing.
 */
export function normalizeLatexDelimiters(text: string): string {
  // Display math: \[...\] → $$...$$  (may span multiple lines)
  let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
  // Inline math: \(...\) → $...$
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`)
  return result
}
