"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface StudentProfileCardProps {
  name: string | null;
  email: string;
  className?: string;
}

/**
 * StudentProfileCard - Circular avatar + name for Needs Attention / Teaching Team sections.
 *
 * Shows avatar with initials fallback and name below.
 */
export function StudentProfileCard({
  name,
  email,
  className,
}: StudentProfileCardProps) {
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
        "flex flex-col items-center gap-2 p-3 rounded-xl",
        "hover:bg-secondary transition-colors cursor-pointer",
        className
      )}
    >
      <Avatar className="h-16 w-16">
        <AvatarFallback className="bg-sage-100 text-teal-800 text-lg">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm text-center text-teal-800 font-medium line-clamp-1 max-w-[80px]">
        {displayName}
      </span>
    </div>
  );
}
