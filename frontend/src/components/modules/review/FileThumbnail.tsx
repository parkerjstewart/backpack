"use client";

import {
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceStatus } from "@/lib/stores/module-draft-store";

interface FileThumbnailProps {
  sourceId: string;
  status: SourceStatus;
  title?: string;
  sourceType?: "link" | "upload" | "text";
  onClick: () => void;
}

export function FileThumbnail({
  sourceId,
  status,
  title,
  sourceType = "upload",
  onClick,
}: FileThumbnailProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "processing":
        return (
          <div className="absolute top-1 right-1 w-4 h-4 bg-sky-700 rounded-full flex items-center justify-center">
            <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
          </div>
        );
      case "completed":
        return (
          <div className="absolute top-1 right-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
            <CheckCircle className="h-2.5 w-2.5 text-accent-foreground" />
          </div>
        );
      case "failed":
        return (
          <div className="absolute top-1 right-1 w-4 h-4 bg-coral-700 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-2.5 w-2.5 text-white" />
          </div>
        );
      default:
        return null;
    }
  };

  const getTypeIcon = () => {
    switch (sourceType) {
      case "link":
        return <Link2 className="h-6 w-6 text-muted-foreground" />;
      case "upload":
      case "text":
      default:
        return <FileText className="h-6 w-6 text-muted-foreground" />;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-16 h-16 rounded-lg transition-all",
        "bg-secondary hover:bg-muted",
        "flex items-center justify-center",
        "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      )}
      title={title || sourceId}
    >
      {getTypeIcon()}
      {getStatusIcon()}
    </button>
  );
}
