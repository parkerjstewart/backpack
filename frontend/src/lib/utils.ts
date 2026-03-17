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

const LATEX_COMMANDS = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "varpi",
  "rho",
  "varrho",
  "sigma",
  "varsigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Upsilon",
  "Phi",
  "Psi",
  "Omega",
  "int",
  "iint",
  "iiint",
  "oint",
  "sum",
  "prod",
  "lim",
  "to",
  "mapsto",
  "in",
  "subset",
  "subseteq",
  "supset",
  "supseteq",
  "cup",
  "cap",
  "wedge",
  "vee",
  "oplus",
  "otimes",
  "times",
  "cdot",
  "pm",
  "mp",
  "neq",
  "leq",
  "geq",
  "approx",
  "sim",
  "cong",
  "equiv",
  "forall",
  "exists",
  "nabla",
  "partial",
  "infty",
  "left",
  "right",
  "langle",
  "rangle",
  "frac",
  "sqrt",
  "mathrm",
  "mathbf",
  "mathbb",
  "mathcal",
  "operatorname",
  "ker",
  "coker",
  "im",
  "dim",
  "Hom",
  "End",
  "Ext",
  "Tor",
  "det",
  "Tr",
  "deg",
  "cd",
] as const

const LATEX_COMMAND_PATTERN = new RegExp(`\\\\(?:${LATEX_COMMANDS.join("|")})\\b`, "g")
const SUPERSCRIPT_SUBSCRIPT_PATTERN =
  /\b([A-Z](?:[_^](?:\{[^{}\n]+\}|[A-Za-z0-9]))+(?:\([A-Za-z0-9\\_^{}+\-*/=,\s]+\))?)/g

function isEscapedAt(text: string, index: number): boolean {
  let backslashCount = 0
  let cursor = index - 1
  while (cursor >= 0 && text[cursor] === "\\") {
    backslashCount += 1
    cursor -= 1
  }
  return backslashCount % 2 === 1
}

function findClosingDelimiter(text: string, start: number, delimiter: "$" | "$$"): number {
  let cursor = start
  while (cursor < text.length) {
    const nextIndex = text.indexOf(delimiter, cursor)
    if (nextIndex === -1) return -1
    if (!isEscapedAt(text, nextIndex)) return nextIndex
    cursor = nextIndex + delimiter.length
  }
  return -1
}

function transformOutsideMath(text: string, transformer: (segment: string) => string): string {
  let cursor = 0
  let plainStart = 0
  let result = ""

  while (cursor < text.length) {
    if (text[cursor] !== "$" || isEscapedAt(text, cursor)) {
      cursor += 1
      continue
    }

    const delimiter: "$" | "$$" = text[cursor + 1] === "$" ? "$$" : "$"
    const closing = findClosingDelimiter(text, cursor + delimiter.length, delimiter)
    if (closing === -1) {
      cursor += delimiter.length
      continue
    }

    result += transformer(text.slice(plainStart, cursor))
    result += text.slice(cursor, closing + delimiter.length)
    cursor = closing + delimiter.length
    plainStart = cursor
  }

  result += transformer(text.slice(plainStart))
  return result
}

function wrapParenthesizedLatex(text: string): string {
  return text.replace(/\(([^()\n]*\\[a-zA-Z]+[^()\n]*)\)/g, (_, inner: string) => `$${inner.trim()}$`)
}

function expandMathSegmentBounds(text: string, start: number, end: number): [number, number] {
  let left = start
  let right = end
  const leftCharPattern = /[A-Za-z0-9_^{}()[\]=+\-*/\\]/
  const rightCharPattern = /[A-Za-z0-9_^{}()[\]=+\-*/\\,]/

  while (left > 0 && leftCharPattern.test(text[left - 1])) {
    left -= 1
  }

  while (right < text.length && rightCharPattern.test(text[right])) {
    right += 1
  }

  return [left, right]
}

function wrapStandaloneLatexCommands(text: string): string {
  LATEX_COMMAND_PATTERN.lastIndex = 0
  let cursor = 0
  let result = ""
  let match: RegExpExecArray | null

  while ((match = LATEX_COMMAND_PATTERN.exec(text)) !== null) {
    const commandStart = match.index
    const commandEnd = commandStart + match[0].length
    const [segmentStart, segmentEnd] = expandMathSegmentBounds(text, commandStart, commandEnd)

    if (segmentEnd <= cursor) continue

    const actualStart = Math.max(segmentStart, cursor)
    const rawSegment = text.slice(actualStart, segmentEnd)
    const trimmedSegment = rawSegment.trim()
    if (!trimmedSegment) continue

    const leadingWhitespace = rawSegment.match(/^\s*/)?.[0] ?? ""
    const trailingWhitespace = rawSegment.match(/\s*$/)?.[0] ?? ""

    result += text.slice(cursor, actualStart)
    result += `${leadingWhitespace}$${trimmedSegment}$${trailingWhitespace}`
    cursor = segmentEnd
    LATEX_COMMAND_PATTERN.lastIndex = cursor
  }

  result += text.slice(cursor)
  return result
}

function wrapSuperscriptSubscriptPatterns(text: string): string {
  return text.replace(SUPERSCRIPT_SUBSCRIPT_PATTERN, (_, expression: string) => `$${expression}$`)
}

/**
 * Heuristically detect bare math-like text and wrap it so remark-math can parse it.
 * This complements explicit delimiters and is intentionally conservative.
 */
export function autoDetectLatex(text: string): string {
  const normalized = normalizeLatexDelimiters(text)
  const withParenthesizedMath = transformOutsideMath(normalized, wrapParenthesizedLatex)
  const withLatexCommands = transformOutsideMath(withParenthesizedMath, wrapStandaloneLatexCommands)
  return transformOutsideMath(withLatexCommands, wrapSuperscriptSubscriptPatterns)
}
