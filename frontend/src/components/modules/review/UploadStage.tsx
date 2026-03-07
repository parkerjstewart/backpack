"use client";

import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { FileThumbnail } from "./FileThumbnail";
import type { SourceStatus } from "@/lib/stores/module-draft-store";

interface UploadStageProps {
  sourceIds: string[];
  sourceStatuses: Record<string, SourceStatus>;
  sourceTitles?: Record<string, string>;
  progressPercentage: number;
  onAddMore: () => void;
  onSourceClick: (sourceId: string) => void;
}

export function UploadStage({
  sourceIds,
  sourceStatuses,
  sourceTitles = {},
  onAddMore,
  onSourceClick,
}: UploadStageProps) {
  const completedCount = sourceIds.filter(
    (id) => sourceStatuses[id] === "completed"
  ).length;
  const failedCount = sourceIds.filter(
    (id) => sourceStatuses[id] === "failed"
  ).length;
  const doneCount = completedCount + failedCount;
  const total = sourceIds.length;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 px-8">
      {/* File grid */}
      <div className="flex flex-wrap gap-4 justify-center max-w-2xl">
        {sourceIds.map((sourceId) => (
          <FileThumbnail
            key={sourceId}
            sourceId={sourceId}
            status={sourceStatuses[sourceId] || "processing"}
            title={sourceTitles[sourceId]}
            size="lg"
            onClick={() => onSourceClick(sourceId)}
          />
        ))}

        {/* Add more button */}
        <motion.div layout>
          <button
            type="button"
            onClick={onAddMore}
            className={cn(
              "w-20 h-20 rounded-lg transition-all",
              "border-2 border-dashed border-teal-800/50",
              "hover:bg-secondary hover:border-teal-800",
              "flex items-center justify-center",
              "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            )}
            title="Add more files"
          >
            <Plus className="h-7 w-7 text-teal-800/50" />
          </button>
        </motion.div>
      </div>

      {/* Status text - below the icons */}
      <motion.div
        className="text-center space-y-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="font-heading text-[36px] font-medium tracking-[-0.02em] text-primary leading-tight">
          {doneCount < total ? "Processing your files..." : "All files ready!"}
        </h2>
        <p className="font-sans text-[18px] text-muted-foreground">
          {doneCount < total
            ? `${doneCount} of ${total} file${total !== 1 ? "s" : ""} processed`
            : `${completedCount} file${completedCount !== 1 ? "s" : ""} ready${failedCount > 0 ? `, ${failedCount} failed` : ""}`}
        </p>
      </motion.div>
    </div>
  );
}
