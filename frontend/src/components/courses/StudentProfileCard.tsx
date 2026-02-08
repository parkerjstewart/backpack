"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface StudentProfileCardProps {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  className?: string;
}

/**
 * StudentProfileCard - Circular avatar + name for Needs Attention / Teaching Team sections.
 *
 * Shows user avatar if available, otherwise neutral muted circle with initial.
 */
export function StudentProfileCard({
  name,
  email,
  avatarUrl,
  className,
}: StudentProfileCardProps) {
  const displayName = name || email.split("@")[0];

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-2",
        className
      )}
    >
      <Avatar className="w-[100px] h-[100px]">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
        ) : (
          <AvatarFallback className="bg-muted text-2xl font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        )}
      </Avatar>
      <span className="text-base text-center text-primary tracking-[-0.16px] line-clamp-1 w-full">
        {displayName}
      </span>
    </div>
  );
}
