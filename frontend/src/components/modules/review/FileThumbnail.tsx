"use client";

import {
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SourceStatus } from "@/lib/stores/module-draft-store";

interface FileThumbnailProps {
  sourceId: string;
  status: SourceStatus;
  title?: string;
  sourceType?: "link" | "upload" | "text";
  size?: "sm" | "lg";
  onClick: () => void;
}

export function FileThumbnail({
  sourceId,
  status,
  title,
  sourceType = "upload",
  size = "sm",
  onClick,
}: FileThumbnailProps) {
  const isLg = size === "lg";

  const getStatusIcon = () => {
    switch (status) {
      case "processing":
        return (
          <div
            className={cn(
              "absolute top-1.5 right-1.5 bg-sky-700 rounded-full flex items-center justify-center",
              isLg ? "w-5 h-5" : "w-4 h-4"
            )}
          >
            <Loader2
              className={cn("text-white animate-spin", isLg ? "h-3 w-3" : "h-2.5 w-2.5")}
            />
          </div>
        );
      case "completed":
        return (
          <div
            className={cn(
              "absolute top-1.5 right-1.5 bg-accent rounded-full flex items-center justify-center",
              isLg ? "w-5 h-5" : "w-4 h-4"
            )}
          >
            <CheckCircle
              className={cn("text-accent-foreground", isLg ? "h-3 w-3" : "h-2.5 w-2.5")}
            />
          </div>
        );
      case "failed":
        return (
          <div
            className={cn(
              "absolute top-1.5 right-1.5 bg-coral-700 rounded-full flex items-center justify-center",
              isLg ? "w-5 h-5" : "w-4 h-4"
            )}
          >
            <AlertTriangle
              className={cn("text-white", isLg ? "h-3 w-3" : "h-2.5 w-2.5")}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const getTypeIcon = () => {
    switch (sourceType) {
      case "link":
        return (
          <Link2
            className={cn("text-muted-foreground", isLg ? "h-8 w-8" : "h-6 w-6")}
          />
        );
      case "upload":
      case "text":
      default:
        return (
          <FileText
            className={cn("text-muted-foreground", isLg ? "h-8 w-8" : "h-6 w-6")}
          />
        );
    }
  };

  return (
    <motion.div layoutId={`file-thumbnail-${sourceId}`} layout>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative rounded-lg transition-all",
          "bg-secondary hover:bg-muted",
          "flex items-center justify-center",
          "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          isLg ? "w-20 h-20" : "w-16 h-16"
        )}
        title={title || sourceId}
      >
        {getTypeIcon()}
        {getStatusIcon()}
      </button>
    </motion.div>
  );
}
