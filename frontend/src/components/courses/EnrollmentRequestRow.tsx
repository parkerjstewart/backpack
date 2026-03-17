"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { EnrollmentRequestResponse } from "@/lib/types/api";

interface EnrollmentRequestRowProps {
  request: EnrollmentRequestResponse;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  isApproving?: boolean;
  isDenying?: boolean;
  className?: string;
}

/**
 * EnrollmentRequestRow - Row for teaching staff to review a pending enrollment request.
 *
 * Shows student name/email and Approve/Deny action buttons.
 * Used in the students page under a "Pending Requests" section.
 */
export function EnrollmentRequestRow({
  request,
  onApprove,
  onDeny,
  isApproving,
  isDenying,
  className,
}: EnrollmentRequestRowProps) {
  const displayName = request.student_name || request.student_email.split("@")[0];
  const isActing = isApproving || isDenying;

  return (
    <div className={cn("flex items-center gap-4 py-4 px-4", className)}>
      {/* Left: Avatar + Name/Email */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <Avatar className="w-8 h-8 shrink-0">
          <AvatarFallback className="bg-muted text-sm font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-lg tracking-[-0.18px] text-primary truncate">
            {displayName}
          </span>
          <span className="text-sm text-muted-foreground truncate">
            {request.student_email}
          </span>
        </div>
      </div>

      {/* Right: Approve / Deny buttons */}
      <div className="flex items-center gap-3 shrink-0">
        <Button
          variant="light"
          size="sm"
          onClick={() => onDeny(request.id)}
          disabled={isActing}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          {isDenying ? "Denying..." : "Deny"}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onApprove(request.id)}
          disabled={isActing}
          className="gap-1.5"
        >
          <Check className="h-4 w-4" />
          {isApproving ? "Approving..." : "Approve"}
        </Button>
      </div>
    </div>
  );
}
