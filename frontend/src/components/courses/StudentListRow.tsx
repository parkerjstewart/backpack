"use client";

import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-xl",
        "hover:bg-secondary transition-colors",
        className
      )}
    >
      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-sage-100 text-teal-800">
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-teal-800 truncate">
          {displayName}
        </p>
        {name && (
          <p className="text-sm text-muted-foreground truncate">{email}</p>
        )}
      </div>

      {/* Mastery indicators */}
      <div className="flex items-center gap-1.5 shrink-0">
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
            <MoreHorizontal className="h-4 w-4" />
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
