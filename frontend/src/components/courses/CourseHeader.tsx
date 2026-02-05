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
 * Tabs: Modules | Students | Insights | Settings
 */
export function CourseHeader({ courseId, courseName }: CourseHeaderProps) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { label: "Modules", href: `/courses/${courseId}` },
    { label: "Students", href: `/courses/${courseId}/students` },
    { label: "Insights", href: `/courses/${courseId}/insights` },
    { label: "Settings", href: `/courses/${courseId}/settings` },
  ];

  const isActiveTab = (href: string) => {
    // Exact match for the modules tab (base course page)
    if (href === `/courses/${courseId}`) {
      return pathname === href || pathname === `${href}/modules`;
    }
    // Prefix match for other tabs
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4">
      {/* Course name */}
      <h1 className="text-page-title text-teal-800">{courseName}</h1>

      {/* Tab navigation */}
      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 rounded-lg text-body font-medium transition-colors",
              isActiveTab(tab.href)
                ? "bg-accent text-teal-800"
                : "text-muted-foreground hover:bg-secondary hover:text-teal-800"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
