"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { SidebarNavLink } from "@/components/layout/SidebarNavLink";
import { useSidebarStore } from "@/lib/stores/sidebar-store";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";
import { PanelLeft, Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Brand name for the sidebar - using serif font (EB Garamond)
const BRAND_NAME = "Backpack";

export function AppSidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse } = useSidebarStore();
  const { courses } = useCoursesStore();
  const { profile } = useUserStore();

  // Filter out archived courses for the main Classes list
  const activeCourses = courses.filter((course) => !course.archived);

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
          <nav className="flex-1 py-4 px-4">
            {/* Classes Section */}
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

            {/* User Avatar */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden cursor-pointer">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.name}
                      width={32}
                      height={32}
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      {profile.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div>
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.role}
                  </p>
                </div>
              </TooltipContent>
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

            {/* User Profile Section */}
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.name}
                    width={40}
                    height={40}
                    className="object-cover"
                  />
                ) : (
                  <span className="text-lg font-medium text-muted-foreground">
                    {profile.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end text-right">
                <span className="font-medium text-lg text-foreground tracking-tight">
                  {profile.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {profile.role}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
