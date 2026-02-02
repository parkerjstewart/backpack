"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { Course, CourseColor } from "@/lib/stores/courses-store";

interface CourseCardProps {
  course: Course;
  className?: string;
}

/**
 * Color configurations for the course card bands
 * Uses exact Figma variables defined in globals.css and tailwind.config.ts:
 * - sage: color/sage/500 (#d4e297), color/sage/700 (#588f58)
 * - amber: color/amber/400 (#f6e587), color/amber/600 (#eab71d)
 * - sky: color/sky/500 (#a4c7e0), color/sky/700 (#1a6e70)
 * - coral: color/coral/500 (#f7b59d), color/coral/700 (#cb6a52)
 */
const colorConfig: Record<CourseColor, { bg: string; borderDark: string }> = {
  sage: {
    bg: "bg-sage-500",
    borderDark: "border-sage-700",
  },
  amber: {
    bg: "bg-amber-400",
    borderDark: "border-amber-600",
  },
  sky: {
    bg: "bg-sky-500",
    borderDark: "border-sky-700",
  },
  coral: {
    bg: "bg-coral-500",
    borderDark: "border-coral-700",
  },
};

/**
 * CourseCard - Displays a course with a colored 3D band header
 *
 * Matches Figma node 85:945 with:
 * - 288px width, 16px border radius
 * - Colored band at top with 3D border effect (flipped vertically)
 * - Hover: border grows from 8px to 16px (briefcase lip lifting)
 * - Course code in EB Garamond 28px
 * - Description in Figtree 16px
 *
 * @example
 * <CourseCard course={course} />
 */
export function CourseCard({ course, className }: CourseCardProps) {
  const color = course.color || "sage";
  const colors = colorConfig[color];

  return (
    <Link href={`/courses/${encodeURIComponent(course.id)}`}>
      <div
        data-slot="course-card"
        className={cn(
          // Card base - fixed width, 16px radius
          "w-[288px] min-w-[260px] max-w-[320px]",
          "rounded-md border border-border bg-card overflow-hidden",
          // Hover state
          "cursor-pointer group shrink-0",
          className
        )}
      >
        {/* Band container - fixed height */}
        <div className="h-[119px] w-full">
          {/* 
            Colored band with bottom border (dark "shadow" edge)
            - Normal orientation (not flipped)
            - On hover: band shrinks height, border grows = "lifts up" effect
            - The band shrinks from bottom, creating illusion of lifting
          */}
          <div
            className={cn(
              "w-full rounded-md",
              "shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]",
              colors.bg,
              // Bottom border for 3D "lip" effect
              "border-b-8 border-solid",
              colors.borderDark,
              // Default height fills container
              "h-[119px]",
              // Hover: shrink height + grow border = lift effect
              // Larger bottom radius on hover so it's visible with thicker border
              "transition-all duration-200 ease-out",
              "group-hover:h-[109px] group-hover:border-b-[12px] group-hover:rounded-b-lg"
            )}
          />
        </div>

        {/* Content area - stays fixed */}
        <div className="flex flex-col gap-0 items-start justify-end p-4 w-full">
          <h3 className="text-card-title text-foreground w-full">
            {course.name}
          </h3>
          {course.description && (
            <p className="text-body text-teal-800 min-h-[38px] w-full line-clamp-2">
              {course.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
