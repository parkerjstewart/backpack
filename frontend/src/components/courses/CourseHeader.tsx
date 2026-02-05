"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface CourseHeaderProps {
  courseId: string;
  courseName: string;
}

interface Tab {
  label: string;
  href: string;
}

/**
 * CourseHeader - Course name + tab navigation.
 *
 * Displays course name on the left and tabs (Modules | Students | Insights | Settings)
 * on the right. Should be used on all course subpages for consistent navigation.
 */
export function CourseHeader({ courseId, courseName }: CourseHeaderProps) {
  const pathname = usePathname();

  // Note: Don't manually encode courseId - Next.js Link handles URL encoding automatically
  const tabs: Tab[] = [
    { label: "Modules", href: `/courses/${courseId}` },
    { label: "Students", href: `/courses/${courseId}/students` },
    { label: "Insights", href: `/courses/${courseId}/insights` },
    { label: "Settings", href: `/courses/${courseId}/settings` },
  ];

  const isActiveTab = (href: string) => {
    // Exact match for the modules tab (base course page)
    if (href === `/courses/${courseId}`) {
      // Match the base course page and any /modules subpaths
      return (
        pathname === href ||
        pathname === `/courses/${courseId}/modules` ||
        pathname.startsWith(`/courses/${courseId}/modules/`)
      );
    }
    // Prefix match for other tabs
    return pathname.startsWith(href);
  };

  return (
    <div className="flex items-center justify-between border-b border-border py-2">
      {/* Course name */}
      <h1 className="font-heading text-[32px] font-medium tracking-[-0.64px] text-teal-800">
        {courseName}
      </h1>

      {/* Tab navigation */}
      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 rounded-2xl text-lg font-medium tracking-[-0.36px] transition-colors",
              isActiveTab(tab.href)
                ? "bg-accent text-teal-800"
                : "border border-border text-teal-800 hover:bg-secondary"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
