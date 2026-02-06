"use client";

import { cn } from "@/lib/utils";

export type AvatarColor = "amber" | "sky" | "coral" | "sage";

interface StudentProfileCardProps {
  name: string | null;
  email: string;
  /** Avatar color variant - matches Figma design */
  color?: AvatarColor;
  className?: string;
}

const avatarColors: Record<AvatarColor, string> = {
  amber: "bg-amber-400", // Yellow for Needs Attention
  sky: "bg-sky-500",     // Blue for Teaching Team
  coral: "bg-coral-500", // Coral for students in list
  sage: "bg-sage-500",   // Sage/green default
};

/**
 * StudentProfileCard - Circular avatar + name for Needs Attention / Teaching Team sections.
 *
 * Shows colored circular avatar and name below.
 * Colors match Figma design:
 * - amber: Needs Attention section (yellow)
 * - sky: Teaching Team section (blue)
 * - coral: Student list rows (orange)
 */
export function StudentProfileCard({
  name,
  email,
  color = "sage",
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
      {/* Solid color circle avatar (no initials, matches Figma) */}
      <div
        className={cn(
          "w-[100px] h-[100px] rounded-full",
          avatarColors[color]
        )}
      />
      <span className="text-base text-center text-primary tracking-[-0.16px] line-clamp-1 w-full">
        {displayName}
      </span>
    </div>
  );
}
