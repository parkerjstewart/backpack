"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvitationResponse } from "@/lib/types/api";

interface PendingInvitationCardProps {
  invitation: InvitationResponse;
  onAccept: (invitationId: string) => void;
  onDecline: (invitationId: string) => void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

/**
 * PendingInvitationCard - Card shown on the courses page for pending invitations.
 *
 * Displays the course title, role, and Accept/Decline buttons.
 */
export function PendingInvitationCard({
  invitation,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: PendingInvitationCardProps) {
  const roleLabel =
    invitation.role === "ta"
      ? "Teaching Assistant"
      : invitation.role === "instructor"
        ? "Instructor"
        : "Student";

  return (
    <div className="flex items-center justify-between gap-6 rounded-xl border border-border bg-white px-6 py-4">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-lg font-medium tracking-[-0.18px] text-primary truncate">
          {invitation.course_title || "Untitled Course"}
        </span>
        <span className="text-sm text-primary/60">
          You&apos;ve been invited as a {roleLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDecline(invitation.id)}
          disabled={isAccepting || isDeclining}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          {isDeclining ? "Declining..." : "Decline"}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onAccept(invitation.id)}
          disabled={isAccepting || isDeclining}
          className="gap-1.5"
        >
          <Check className="h-4 w-4" />
          {isAccepting ? "Accepting..." : "Accept"}
        </Button>
      </div>
    </div>
  );
}
