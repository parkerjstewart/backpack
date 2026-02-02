"use client";

import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseCard, CreateCourseDialog } from "@/components/courses";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";

export default function CoursesPage() {
  const { courses } = useCoursesStore();
  const { profile } = useUserStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeCourses = courses.filter((course) => !course.archived);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        {/* Main content container with 32px padding (design system --page-padding) */}
        <div className="flex flex-col gap-4 p-8">
          {/* Hero section - centered welcome text */}
          <div className="flex items-center justify-center pt-[var(--hero-padding-top)] pb-[var(--hero-padding-bottom)] w-full">
            <h1 className="text-hero text-center">
              Welcome back, {profile.name}!
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
