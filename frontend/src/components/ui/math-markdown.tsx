"use client";

import { ComponentProps, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { autoDetectLatex, normalizeLatexDelimiters } from "@/lib/utils";

type ReactMarkdownProps = ComponentProps<typeof ReactMarkdown>;

interface MathMarkdownProps extends Omit<ReactMarkdownProps, "children"> {
  children?: string | null;
  detectMath?: boolean;
}

export function MathMarkdown({
  children,
  detectMath = true,
  remarkPlugins,
  rehypePlugins,
  ...props
}: MathMarkdownProps) {
  const content = useMemo(() => {
    const text = children ?? "";
    return detectMath ? autoDetectLatex(text) : normalizeLatexDelimiters(text);
  }, [children, detectMath]);

  const mergedRemarkPlugins = useMemo(
    () => [remarkGfm, remarkMath, ...(remarkPlugins ?? [])],
    [remarkPlugins]
  );

  const mergedRehypePlugins = useMemo(
    () => [rehypeKatex, ...(rehypePlugins ?? [])],
    [rehypePlugins]
  );

  return (
    <ReactMarkdown
      remarkPlugins={mergedRemarkPlugins}
      rehypePlugins={mergedRehypePlugins}
      {...props}
    >
      {content}
    </ReactMarkdown>
  );
}
