"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getCoursePermissions, type CourseMembershipRole } from "@/lib/permissions/course";

interface CourseHeaderProps {
  courseId: string;
  courseName: string;
  membershipRole?: CourseMembershipRole;
  moduleName?: string;
  moduleId?: string;
  pageName?: string;
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
export function CourseHeader({ courseId, courseName, membershipRole, moduleName, moduleId, pageName }: CourseHeaderProps) {
  const pathname = usePathname();
  const permissions = getCoursePermissions(membershipRole);

  // Note: Don't manually encode courseId - Next.js Link handles URL encoding automatically
  const tabs: Tab[] = [
    { label: "Modules", href: `/courses/${courseId}` },
  ];
  if (permissions.canManageMembers) {
    tabs.push({ label: "Students", href: `/courses/${courseId}/students` });
  }
  if (permissions.canManageCourseSettings) {
    tabs.push({ label: "Settings", href: `/courses/${courseId}/settings` });
  }

  const isActiveTab = (href: string) => {
    // Decode pathname to handle URL-encoded characters (e.g. %3A for : in SurrealDB IDs)
    const decodedPathname = decodeURIComponent(pathname);

    // Exact match for the modules tab (base course page)
    if (href === `/courses/${courseId}`) {
      // Match the base course page and any /modules subpaths
      return (
        decodedPathname === href ||
        decodedPathname === `/courses/${courseId}/modules` ||
        decodedPathname.startsWith(`/courses/${courseId}/modules/`)
      );
    }
    // Prefix match for other tabs
    return decodedPathname.startsWith(href);
  };

  return (
    <div className="flex items-center justify-between border-b border-border py-2">
      {/* Course name (or breadcrumb when inside a module/page) */}
      <h1 className="text-section text-primary flex items-baseline gap-2 flex-wrap">
        <Link href={`/courses/${courseId}`} className="hover:opacity-70 transition-opacity">
          {courseName}
        </Link>
        {moduleName && (
          <>
            <span className="text-muted-foreground">›</span>
            {moduleId && pageName ? (
              <Link
                href={`/courses/${courseId}/modules/${moduleId}`}
                className="hover:opacity-70 transition-opacity"
              >
                {moduleName}
              </Link>
            ) : (
              <span>{moduleName}</span>
            )}
          </>
        )}
        {pageName && (
          <>
            <span className="text-muted-foreground">›</span>
            <span className="text-primary">{pageName}</span>
          </>
        )}
      </h1>

      {/* Tab navigation */}
      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-1 rounded-3xl text-[18px] leading-normal font-medium transition-colors",
              isActiveTab(tab.href)
                ? "bg-sidebar-accent text-primary tracking-[-0.18px]"
                : "border border-border text-primary hover:bg-secondary tracking-[-0.36px]",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
