"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FileThumbnail } from "./FileThumbnail";
import type { SourceStatus } from "@/lib/stores/module-draft-store";

interface FilesSidebarProps {
  sourceIds: string[];
  sourceStatuses: Record<string, SourceStatus>;
  sourceTitles?: Record<string, string>;
  onAddMore: () => void;
  onSourceClick: (sourceId: string) => void;
  maxVisible?: number;
}

export function FilesSidebar({
  sourceIds,
  sourceStatuses,
  sourceTitles = {},
  onAddMore,
  onSourceClick,
  maxVisible = 9,
}: FilesSidebarProps) {
  // Calculate visible items (reserve 1 slot for add button)
  const visibleCount = Math.min(sourceIds.length, maxVisible - 1);
  const visibleSources = sourceIds.slice(0, visibleCount);
  const overflowCount = sourceIds.length - visibleCount;

  return (
    <div className="w-16 flex-shrink-0">
      <Label className="font-heading text-lg mb-4 block">Files</Label>

      <div className="flex flex-col gap-2">
        {/* Add button */}
        <button
          type="button"
          onClick={onAddMore}
          className={cn(
            "w-16 h-16 rounded-lg transition-colors",
            "border-2 border-dashed border-[rgba(20,48,46,0.8)]",
            "hover:bg-secondary",
            "flex items-center justify-center",
            "focus:outline-none focus:ring-2 focus:ring-[#d4e297] focus:ring-offset-2"
          )}
          title="Add more files"
        >
          <Plus className="h-6 w-6 text-muted-foreground" />
        </button>

        {/* Source thumbnails */}
        {visibleSources.map((sourceId, index) => {
          const isLastVisible =
            index === visibleSources.length - 1 && overflowCount > 0;

          return (
            <div key={sourceId} className="relative">
              <FileThumbnail
                sourceId={sourceId}
                status={sourceStatuses[sourceId] || "processing"}
                title={sourceTitles[sourceId]}
                onClick={() => onSourceClick(sourceId)}
              />

              {/* Overflow indicator on last visible item */}
              {isLastVisible && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center pointer-events-none">
                  <span className="text-white text-sm font-medium">
                    +{overflowCount + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
