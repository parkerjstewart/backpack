"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { useSidebarStore } from "@/lib/stores/sidebar-store";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { PanelLeft, Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Brand name for the sidebar - using serif font (EB Garamond)
const BRAND_NAME = "Backpack";

function isTeachingRole(role?: string | null): boolean {
  return role === "instructor" || role === "ta";
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse } = useSidebarStore();
  const { courses } = useCoursesStore();
  const { profile } = useUserStore();
  const { currentUser } = useAuthStore();

  // Filter out archived courses for the main Classes list
  const activeCourses = courses.filter((course) => !course.archived);

  // Split courses by membership role
  const teachingCourses = activeCourses.filter((c) =>
    isTeachingRole(c.membershipRole)
  );
  const enrolledCourses = activeCourses.filter(
    (c) => c.membershipRole === "student"
  );

  // Get display info
  const displayName = currentUser?.name || profile.name;
  const displayEmail = currentUser?.email || "";

  const avatarUrl = currentUser?.avatar_url || profile.avatarUrl;

  // User avatar component (reused in both collapsed/expanded states)
  const UserAvatar = ({ size = 40 }: { size?: number }) => (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0"
      )}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          width={size}
          height={size}
          className="object-cover w-full h-full"
        />
      ) : (
        <span
          className={cn(
            "font-medium text-muted-foreground",
            size >= 40 ? "text-lg" : "text-sm"
          )}
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );

  // Sectioned course list
  const SectionedCourseList = () => {
    const sections = [
      { label: "Teaching", courses: teachingCourses },
      { label: "Enrolled", courses: enrolledCourses },
    ];

    // If no courses have membership roles, show all courses unsectioned
    const hasMembershipData = activeCourses.some((c) => c.membershipRole);

    if (!hasMembershipData) {
      return (
        <div className="mb-4">
          <h3 className="mb-2 font-heading text-lg font-normal text-foreground underline underline-offset-4 decoration-1 tracking-tight">
            Courses
          </h3>
          <div className="space-y-0.5">
            {activeCourses.map((course) => (
              <SidebarNavLink
                key={course.id}
                href={`/courses/${encodeURIComponent(course.id)}`}
                matchMode="startsWith"
                variant="course"
              >
                {course.name}
              </SidebarNavLink>
            ))}
            {activeCourses.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">
                No classes yet.
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <>
        {sections.map(
          (section) =>
            section.courses.length > 0 && (
              <div key={section.label} className="mb-4">
                <h3 className="mb-2 font-heading text-lg font-normal text-foreground underline underline-offset-4 decoration-1 tracking-tight">
                  {section.label}
                </h3>
                <div className="space-y-0.5">
                  {section.courses.map((course) => (
                    <SidebarNavLink
                      key={course.id}
                      href={`/courses/${encodeURIComponent(course.id)}`}
                      matchMode="startsWith"
                      variant="course"
                    >
                      {course.name}
                    </SidebarNavLink>
                  ))}
                </div>
              </div>
            )
        )}
        {activeCourses.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">
            No classes yet.
          </p>
        )}
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "app-sidebar flex h-full flex-col bg-sidebar border-sidebar-border border-r transition-all duration-300",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        {/* Header - Brand name and collapse toggle */}
        <div
          className={cn(
            "flex items-center pt-4",
            isCollapsed ? "justify-center px-2" : "justify-between pl-4 pr-2"
          )}
        >
          {isCollapsed ? (
            <IconButton
              onClick={toggleCollapse}
              className="text-sidebar-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft />
            </IconButton>
          ) : (
            <>
              <Link
                href="/courses"
                className={cn(
                  "flex items-center px-2 py-1 rounded-xl transition-colors",
                  pathname === "/courses" && "bg-sidebar-accent"
                )}
              >
                {/* Brand name using serif font (EB Garamond) - no logo icon */}
                <span className="text-2xl font-heading font-medium text-sidebar-foreground tracking-tight">
                  {BRAND_NAME}
                </span>
              </Link>
              <IconButton
                onClick={toggleCollapse}
                className="text-sidebar-foreground"
                data-testid="sidebar-toggle"
                aria-label="Collapse sidebar"
              >
                <PanelLeft />
              </IconButton>
            </>
          )}
        </div>

        {/* Main Navigation - Classes Section (hidden when collapsed) */}
        {isCollapsed ? (
          <div className="flex-1" />
        ) : (
          <nav className="flex-1 py-4 px-4 overflow-y-auto">
            <SectionedCourseList />
          </nav>
        )}

        {/* Footer - Archived, Settings, and User Profile */}
        {isCollapsed ? (
          <div className="border-t border-sidebar-border py-4 px-2 flex flex-col items-center gap-3">
            {/* Settings Icon */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                    "text-teal-800 hover:bg-secondary hover:text-foreground",
                    pathname === "/settings" &&
                      "bg-sidebar-accent text-foreground"
                  )}
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>

            {/* User Avatar - navigates to settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className="cursor-pointer rounded-full"
                >
                  <UserAvatar size={32} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Profile &amp; Settings</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="border-t border-sidebar-border py-4 px-4">
            {/* Archived and Settings Links */}
            <div className="flex flex-col items-start gap-1 mb-4">
              <SidebarNavLink href="/archived" variant="heading">
                Archived
              </SidebarNavLink>
              <SidebarNavLink href="/settings" variant="heading">
                Settings
              </SidebarNavLink>
            </div>

            {/* User Profile Section - navigates to settings */}
            <Link
              href="/settings"
              className="flex items-center justify-between w-full cursor-pointer rounded-lg p-1 transition-colors hover:bg-secondary"
            >
              <UserAvatar size={40} />
              <div className="flex flex-col items-end text-right">
                <span className="font-medium text-lg text-foreground tracking-tight">
                  {displayName}
                </span>
                {displayEmail && (
                  <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                    {displayEmail}
                  </span>
                )}
              </div>
            </Link>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
