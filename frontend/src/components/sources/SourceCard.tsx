"use client";

import React, { useState, useEffect, useRef } from "react";
import { SourceListResponse } from "@/lib/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  File,
  ExternalLink,
  MoreVertical,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Unlink,
  Image,
  FileAudio,
  FileVideo,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useSourceStatus } from "@/lib/hooks/use-sources";
import { useTranslation } from "@/lib/hooks/use-translation";
import { TranslationKeys } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/api/query-client";

interface SourceCardProps {
  source: SourceListResponse;
  onDelete?: (sourceId: string) => void;
  onRetry?: (sourceId: string) => void;
  onRemoveFromModule?: (sourceId: string) => void;
  onRename?: (sourceId: string, newTitle: string) => Promise<void>;
  onClick?: (sourceId: string) => void;
  onRefresh?: () => void;
  className?: string;
  showRemoveFromModule?: boolean;
  /** When provided, "Remove from Module" navigates here instead of calling onRemoveFromModule */
  editModuleHref?: string;
}

function getSourceIcon(source: SourceListResponse) {
  if (source.asset?.url) return ExternalLink;
  if (source.asset?.file_path) {
    const ext = source.asset.file_path.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return FileText;
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext ?? ""))
      return Image;
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext ?? ""))
      return FileAudio;
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext ?? ""))
      return FileVideo;
    return File;
  }
  return FileText;
}

const getStatusConfig = (t: TranslationKeys) =>
  ({
    new: {
      icon: Clock,
      color: "text-info",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      label: t.sources.statusProcessing,
      description: t.sources.statusPreparingDesc,
    },
    queued: {
      icon: Clock,
      color: "text-info",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      label: t.sources.statusQueued,
      description: t.sources.statusQueuedDesc,
    },
    running: {
      icon: Loader2,
      color: "text-info",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      label: t.sources.statusProcessing,
      description: t.sources.statusProcessingDesc,
    },
    completed: {
      icon: CheckCircle,
      color: "text-success-fg",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      label: t.sources.statusCompleted,
      description: t.sources.statusCompletedDesc,
    },
    failed: {
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
      label: t.sources.statusFailed,
      description: t.sources.statusFailedDesc,
    },
  }) as const;

type SourceStatus = "new" | "queued" | "running" | "completed" | "failed";

function isSourceStatus(status: unknown): status is SourceStatus {
  return (
    typeof status === "string" &&
    ["new", "queued", "running", "completed", "failed"].includes(status)
  );
}

export function SourceCard({
  source,
  onClick,
  onDelete,
  onRetry,
  onRemoveFromModule,
  onRename,
  onRefresh,
  className,
  showRemoveFromModule = false,
  editModuleHref,
}: SourceCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const statusConfigMap = getStatusConfig(t);

  // Only fetch status for sources that might have async processing
  const sourceWithStatus = source as SourceListResponse & {
    command_id?: string;
    status?: string;
  };

  // Track processing state to continue polling until we detect completion
  const [wasProcessing, setWasProcessing] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Always fetch status if:
  // 1. Source has a command_id (might be processing)
  // 2. Source status indicates processing (from list)
  // 3. We were previously processing (to catch completion)
  // 4. Status is unknown/null but command_id exists (need to check actual status)
  const shouldFetchStatus =
    !!sourceWithStatus.command_id ||
    sourceWithStatus.status === "new" ||
    sourceWithStatus.status === "queued" ||
    sourceWithStatus.status === "running" ||
    wasProcessing || // Keep polling if we were processing to catch the completion
    !!(sourceWithStatus.command_id && !sourceWithStatus.status); // Command exists but no status - need to check

  const { data: statusData, isLoading: statusLoading } = useSourceStatus(
    source.id,
    shouldFetchStatus,
  );

  // Determine current status
  // Priority: statusData (from status API) > source.status (from list) > inferred from command_id/embedded state
  // If status API returns null/undefined but we have statusData.message, check if it's a legacy source
  let rawStatus: string | undefined = undefined;

  if (statusData?.status) {
    // Status API returned a status - use it (most reliable)
    rawStatus = statusData.status;
  } else if (
    statusData?.message &&
    statusData.message.includes("Legacy source")
  ) {
    // Status API explicitly says it's a legacy source (completed)
    rawStatus = "completed";
  } else if (statusData && !statusData.status && source.embedded_chunks > 0) {
    // Status API returned but status is null/undefined, but source has embeddings - likely completed
    rawStatus = "completed";
  } else if (sourceWithStatus.status) {
    // Fall back to status from source list
    rawStatus = sourceWithStatus.status;
  } else if (sourceWithStatus.command_id && !statusData) {
    // Has command_id but status API hasn't responded yet - likely just created, treat as 'new'
    rawStatus = "new";
  } else if (source.embedded_chunks > 0 || source.embedded) {
    // Source has embeddings - definitely completed
    rawStatus = "completed";
  } else if (sourceWithStatus.command_id) {
    // Has command_id but no embeddings - might be processing
    rawStatus = "new";
  } else {
    // No command_id and no status - assume completed (legacy source)
    rawStatus = "completed";
  }

  const currentStatus: SourceStatus = isSourceStatus(rawStatus)
    ? rawStatus
    : "completed";

  // Track processing state and detect completion
  useEffect(() => {
    const currentStatusFromData =
      statusData?.status || sourceWithStatus.status || rawStatus;

    // If we're currently processing, mark that we were processing
    if (
      currentStatusFromData === "new" ||
      currentStatusFromData === "running" ||
      currentStatusFromData === "queued"
    ) {
      setWasProcessing(true);
    }

    // If we were processing and now completed/failed, trigger refresh and stop polling
    if (
      wasProcessing &&
      (currentStatusFromData === "completed" ||
        currentStatusFromData === "failed")
    ) {
      setWasProcessing(false); // Stop polling

      // Invalidate sources queries to refresh the list with updated status
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sources() });

      if (onRefresh) {
        // Also call the manual refresh callback if provided
        setTimeout(() => {
          onRefresh();
        }, 500); // Small delay to ensure API is updated
      }
    }
  }, [
    statusData,
    sourceWithStatus.status,
    wasProcessing,
    onRefresh,
    source.id,
    rawStatus,
    queryClient,
  ]);

  const statusConfig =
    statusConfigMap[currentStatus] || statusConfigMap.completed;
  const StatusIcon = statusConfig.icon;
  const SourceTypeIcon = getSourceIcon(source);

  const title = source.title || t.sources.untitledSource;

  const handleRetry = () => {
    if (onRetry) {
      onRetry(source.id);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(source.id);
    }
  };

  const handleRemoveFromModule = () => {
    if (onRemoveFromModule) {
      onRemoveFromModule(source.id);
    }
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(source.id);
    }
  };

  const handleRenameStart = () => {
    setRenameValue(title);
    setIsRenaming(true);
  };

  const handleRenameSave = async () => {
    const newTitle = renameValue.trim();
    if (newTitle && newTitle !== source.title && onRename) {
      await onRename(source.id, newTitle);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleRenameSave();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  };

  const isProcessing: boolean =
    currentStatus === "new" ||
    currentStatus === "running" ||
    currentStatus === "queued";
  const isFailed: boolean = currentStatus === "failed";
  const isCompleted: boolean = currentStatus === "completed";

  const hasActions = !!(
    onDelete ||
    onRetry ||
    onRemoveFromModule ||
    showRemoveFromModule ||
    onRename
  );

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:bg-secondary group relative cursor-pointer border border-border/60",
        className,
      )}
      onClick={handleCardClick}
    >
      <CardContent className="px-3 py-2">
        {/* Status badge — only for non-completed states */}
        {!isCompleted && (
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
                statusConfig.bgColor,
                statusConfig.color,
              )}
            >
              <StatusIcon
                className={cn("h-3 w-3", isProcessing && "animate-spin")}
              />
              {statusLoading && shouldFetchStatus
                ? t.sources.checking
                : statusConfig.label}
            </div>
          </div>
        )}

        {/* Icon + title + actions */}
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-7 h-7 rounded-md bg-secondary group-hover:bg-background flex items-center justify-center transition-colors">
            <SourceTypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => void handleRenameSave()}
              className="flex-1 min-w-0 text-sm font-medium bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h4
              className="flex-1 min-w-0 text-sm font-medium leading-tight line-clamp-2"
              title={title}
            >
              {title}
            </h4>
          )}

          {hasActions && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {showRemoveFromModule && (
                    <>
                      {editModuleHref ? (
                        <DropdownMenuItem asChild>
                          <Link
                            href={editModuleHref}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Unlink className="h-4 w-4 mr-2" />
                            {t.sources.removeFromModule}
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromModule();
                          }}
                          disabled={!onRemoveFromModule}
                        >
                          <Unlink className="h-4 w-4 mr-2" />
                          {t.sources.removeFromModule}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {isFailed && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry();
                        }}
                        disabled={!onRetry}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t.sources.retryProcessing}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {onRename && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameStart();
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    disabled={!onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t.sources.deleteSource}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
