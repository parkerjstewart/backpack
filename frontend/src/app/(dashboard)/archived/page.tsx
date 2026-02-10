"use client";

import { useEffect } from "react";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useCoursesStore, type Course } from "@/lib/stores/courses-store";
import { useCourses, useUpdateCourse } from "@/lib/hooks/use-courses";
import { ArchiveRestore } from "lucide-react";
import { getCoursePermissions } from "@/lib/permissions/course";

/**
 * Wrapper around CourseCard that adds a "Restore" overlay button.
 */
function ArchivedCourseCard({
  course,
  onRestore,
  isRestoring,
}: {
  course: Course;
  onRestore: (courseId: string) => void;
  isRestoring: boolean;
}) {
  return (
    <div className="relative group/archive">
      <CourseCard course={course} />
      {/* Restore overlay button – appears on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover/archive:opacity-100 transition-opacity">
        <Button
          variant="outline"
          size="sm"
          className="bg-card/90 backdrop-blur-sm shadow-sm"
          disabled={isRestoring}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRestore(course.id);
          }}
          title="Restore course"
        >
          <ArchiveRestore className="h-4 w-4 mr-1" />
          Restore
        </Button>
      </div>
    </div>
  );
}

export default function ArchivedPage() {
  const { getCourseColor } = useCoursesStore();

  // Fetch archived courses from backend
  const { data: coursesData, isLoading } = useCourses({ archived: true });

  // Convert backend responses to local Course format for CourseCard
  const archivedCourses: Course[] = (coursesData ?? []).map((c) => ({
    id: c.id,
    name: c.title,
    description: c.description ?? undefined,
    archived: c.archived,
    createdAt: c.created,
    updatedAt: c.updated,
    color: getCourseColor(c.id),
    membershipRole: c.membership_role,
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
        <div className="flex flex-col gap-4 p-8">
          {/* Page header */}
          <div className="flex items-center justify-center pt-[var(--hero-padding-top)] pb-[var(--hero-padding-bottom)] w-full">
            <h1 className="text-hero text-center">Archived Courses</h1>
          </div>

          {/* Archived courses grid */}
          {archivedCourses.length > 0 ? (
            <div className="flex flex-wrap gap-6">
              {archivedCourses.map((course) => (
                <RestorableCourseCard
                  key={course.id}
                  course={course}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-body text-muted-foreground">
                No archived courses.
              </p>
              <Link href="/courses">
                <Button variant="outline">Back to Courses</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Wrapper that provides the restore mutation scoped to a specific course.
 */
function RestorableCourseCard({ course }: { course: Course }) {
  const permissions = getCoursePermissions(course.membershipRole);
  const updateCourse = useUpdateCourse(course.id);

  const handleRestore = (courseId: string) => {
    updateCourse.mutate({ archived: false });
  };

  if (!permissions.canManageCourseSettings) {
    return <CourseCard course={course} />;
  }

  return (
    <ArchivedCourseCard
      course={course}
      onRestore={handleRestore}
      isRestoring={updateCourse.isPending}
    />
  );
}
