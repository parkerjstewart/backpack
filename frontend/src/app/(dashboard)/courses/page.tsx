"use client";

import { useState, useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseCard, CreateCourseDialog } from "@/components/courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useCoursesStore, type Course } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";
import { useCourses } from "@/lib/hooks/use-courses";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function CoursesPage() {
  const { setCourses, getCourseColor } = useCoursesStore();
  const { profile } = useUserStore();
  const { currentUser } = useAuthStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch courses from backend
  const { data: coursesData, isLoading } = useCourses({ archived: false });

  // Sync backend courses to local store (for color management)
  useEffect(() => {
    if (coursesData) {
      const localCourses: Course[] = coursesData.map((c) => ({
        id: c.id,
        name: c.title,
        description: c.description ?? undefined,
        archived: c.archived,
        createdAt: c.created,
        updatedAt: c.updated,
        color: getCourseColor(c.id),
      }));
      setCourses(localCourses);
    }
  }, [coursesData, setCourses, getCourseColor]);

  // Get display name
  const displayName = currentUser?.name || profile.name;

  // Convert backend courses to local format for CourseCard
  const activeCourses: Course[] = (coursesData ?? []).map((c) => ({
    id: c.id,
    name: c.title,
    description: c.description ?? undefined,
    archived: c.archived,
    createdAt: c.created,
    updatedAt: c.updated,
    color: getCourseColor(c.id),
  }));

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        {/* Main content container with 32px padding (design system --page-padding) */}
        <div className="flex flex-col gap-4 p-8">
          {/* Hero section - centered welcome text */}
          <div className="flex items-center justify-center pt-[var(--hero-padding-top)] pb-[var(--hero-padding-bottom)] w-full">
            <h1 className="text-hero text-center">
              Welcome back, {displayName}!
            </h1>
          </div>

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              + Create New Course
            </Button>
          </div>

          {/* Courses section */}
          <div className="flex flex-col gap-4 mt-4">
            <h2 className="text-title text-teal-800">Courses</h2>

            {activeCourses.length > 0 ? (
              // Responsive flex-wrap with 24px gap between cards
              <div className="flex flex-wrap gap-6">
                {activeCourses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">
                No courses yet. Use &quot;Create New Course&quot; to get
                started.
              </p>
            )}
          </div>
        </div>
      </div>

      <CreateCourseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  );
}
