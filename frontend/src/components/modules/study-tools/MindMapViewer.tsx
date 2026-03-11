"use client";

import { useEffect, useRef, useState } from "react";
import type { MindMapData, MindMapNode } from "@/lib/api/study-tools";

interface MindMapViewerProps {
  data: MindMapData;
}

function nodesToMermaid(node: MindMapNode, depth = 0): string {
  const indent = "  ".repeat(depth + 1);
  const label = node.label.replace(/"/g, "'");
  let lines = [`${indent}${label}`];
  for (const child of node.children ?? []) {
    lines = lines.concat(nodesToMermaid(child, depth + 1));
  }
  return lines.join("\n");
}

function buildMermaidCode(data: MindMapData): string {
  return `mindmap\n${nodesToMermaid(data.root)}`;
}

function FallbackTree({ node, depth = 0 }: { node: MindMapNode; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 16 }} className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 py-0.5">
        {depth > 0 && (
          <span className="text-muted-foreground text-xs">{"└─"}</span>
        )}
        <span
          className={
            depth === 0
              ? "text-sm font-semibold"
              : depth === 1
                ? "text-sm font-medium"
                : "text-xs text-muted-foreground"
          }
        >
          {node.label}
        </span>
      </div>
      {(node.children ?? []).map((child, i) => (
        <FallbackTree key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function MindMapViewer({ data }: MindMapViewerProps) {
  const renderIdRef = useRef(`mindmap-${crypto.randomUUID()}`);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const mermaidCode = buildMermaidCode(data);
    // Use a fresh ID on each render to avoid Mermaid's internal ID cache conflicts
    const renderId = `mindmap-${crypto.randomUUID()}`;

    import("mermaid")
      .then((mod) => {
        const mermaid = mod.default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral" });
        return mermaid.render(renderId, mermaidCode);
      })
      .then(({ svg }) => {
        if (!cancelled) setSvgContent(svg);
      })
      .catch(() => {
        if (!cancelled) setUseFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (useFallback) {
    return (
      <div className="rounded-sm border border-border bg-card p-6 overflow-auto">
        <p className="text-xs text-muted-foreground mb-4 font-medium uppercase tracking-wide">
          {data.title}
        </p>
        <FallbackTree node={data.root} />
      </div>
    );
  }

  if (!svgContent) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground animate-pulse">
        Rendering mind map…
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4 overflow-auto">
      <div
        dangerouslySetInnerHTML={{ __html: svgContent }}
        className="w-full [&_svg]:w-full [&_svg]:max-w-full"
      />
    </div>
  );
}
