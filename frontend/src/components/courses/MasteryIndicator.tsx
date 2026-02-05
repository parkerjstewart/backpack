"use client";

import { cn } from "@/lib/utils";
import type { MasteryStatus } from "@/lib/types/api";

interface MasteryIndicatorProps {
  moduleNumber: number;
  status: MasteryStatus;
  className?: string;
}

/**
 * MasteryIndicator - Badge showing module mastery status (M1, M2, etc.)
 *
 * Status colors:
 * - mastered: sage green (bg-sage-500)
 * - progressing: amber (bg-amber-400)
 * - struggling: coral (bg-coral-500)
 * - incomplete: dashed border, transparent bg
 */
export function MasteryIndicator({
  moduleNumber,
  status,
  className,
}: MasteryIndicatorProps) {
  const statusStyles: Record<MasteryStatus, string> = {
    mastered: "bg-sage-500 text-white border-transparent",
    progressing: "bg-amber-400 text-teal-800 border-transparent",
    struggling: "bg-coral-500 text-white border-transparent",
    incomplete: "bg-transparent text-muted-foreground border-dashed border-muted-foreground",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center",
        "h-8 w-8 rounded-full border-2",
        "text-xs font-medium",
        statusStyles[status],
        className
      )}
    >
      M{moduleNumber}
    </div>
  );
}
