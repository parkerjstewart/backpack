"use client";

import { MoreVertical } from "lucide-react";
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
  name: string | null;
  email: string;
  moduleMastery: ModuleMasteryResponse[];
  onRemove?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

/**
 * StudentListRow - Row with avatar, name, mastery indicators, and menu.
 *
 * Shows student info with colored M1-M8 badges for each module's mastery status.
 * Uses coral-colored circular avatar to match Figma design.
 */
export function StudentListRow({
  name,
  email,
  moduleMastery,
  onRemove,
  onViewDetails,
  className,
}: StudentListRowProps) {
  const displayName = name || email.split("@")[0];

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
