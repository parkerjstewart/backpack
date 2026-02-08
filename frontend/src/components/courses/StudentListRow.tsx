"use client";

import { MoreVertical, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MasteryIndicator } from "./MasteryIndicator";
import type { ModuleMasteryResponse } from "@/lib/types/api";

interface StudentListRowProps {
  variant?: "default" | "pending";
  name: string | null;
  email: string;
  moduleMastery?: ModuleMasteryResponse[];
  onRemove?: () => void;
  onViewDetails?: () => void;
  onCancel?: () => void;
  onResend?: () => void;
  className?: string;
}

/**
 * StudentListRow - Row with avatar, name, mastery indicators, and menu.
 *
 * Supports two variants:
 * - "default": Coral avatar, regular name, mastery badges, three-dot menu
 * - "pending": X icon (cancel), italic name with "(Pending)", email, refresh icon
 *
 * Figma reference: node 204:2968 (StudentCard component)
 */
export function StudentListRow({
  variant = "default",
  name,
  email,
  moduleMastery = [],
  onRemove,
  onViewDetails,
  onCancel,
  onResend,
  className,
}: StudentListRowProps) {
  const displayName = name || email.split("@")[0];

  if (variant === "pending") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 py-4 px-4",
          className
        )}
      >
        {/* Left: X icon + Italic name (Pending) */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onCancel}
            className="shrink-0 p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Cancel invitation"
          >
            <X className="h-6 w-6 text-primary/40" />
          </button>
          <span className="text-lg italic tracking-[-0.18px] text-primary/40 truncate">
            {displayName} (Pending)
          </span>
        </div>

        {/* Right: Email + Refresh icon */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-lg italic tracking-[-0.18px] text-primary/40">
            {email}
          </span>
          <button
            onClick={onResend}
            className="shrink-0 p-1 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Resend invitation"
          >
            <RefreshCw className="h-5 w-5 text-primary/40" />
          </button>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={cn(
        "flex items-center gap-4 py-4 px-4",
        className
      )}
    >
      {/* Left: Avatar + Name */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Coral colored circle avatar (matches Figma) */}
        <div className="w-8 h-8 rounded-full bg-coral-500 shrink-0" />
        <span className="text-lg tracking-[-0.18px] text-primary truncate">
          {displayName}
        </span>
      </div>

      {/* Right: Mastery indicators + Actions menu */}
      <div className="flex items-center gap-3">
        {moduleMastery.map((mastery, index) => (
          <MasteryIndicator
            key={mastery.module_id}
            moduleNumber={index + 1}
            status={mastery.status}
          />
        ))}
      </div>

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onViewDetails && (
            <DropdownMenuItem onClick={onViewDetails}>
              View details
            </DropdownMenuItem>
          )}
          {onRemove && (
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              Remove from course
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
