"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseHeader, CourseModuleCard } from "@/components/courses";
import { useModules, useUpdateModule } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useCourse, useCourseStudents } from "@/lib/hooks/use-courses";
import { CreateModuleWizard } from "@/components/modules/CreateModuleWizard";
import { useState, useMemo, useEffect } from "react";
import {
  getCoursePermissions,
  normalizeCourseMembershipRole,
} from "@/lib/permissions/course";

export default function CoursePage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { moduleCourseMap } = useCoursesStore();

  // Fetch course from backend API
  const { data: course, isLoading: courseLoading } = useCourse(courseId);

  const { data: modules, isLoading: modulesLoading } = useModules(false);
  const { data: students } = useCourseStudents(courseId);
  const updateModule = useUpdateModule();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Filter modules that belong to this course
  // Check both the backend course_id field and the legacy store-based mapping
  const courseModules = useMemo(
    () =>
      (modules ?? []).filter(
        (m) => m.course_id === courseId || moduleCourseMap[m.id] === courseId,
      ),
    [modules, moduleCourseMap, courseId],
  );

  // Sync modules that are in the store but not in the backend
  // This ensures the backend has the course association for mastery tracking
  useEffect(() => {
    if (!modules || !courseId) return;

    const modulesToSync = modules.filter((m) => {
      // Module is in store for this course but doesn't have course_id in backend
      const inStoreForThisCourse = moduleCourseMap[m.id] === courseId;
      const notInBackend = !m.course_id;
      return inStoreForThisCourse && notInBackend;
    });

    // Sync each module (fire and forget)
    modulesToSync.forEach((m) => {
      updateModule.mutate({
        id: m.id,
        data: { course_id: courseId },
      });
    });
  }, [modules, courseId, moduleCourseMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentModule = useMemo(() => {
    if (!courseModules.length) return undefined;
    return [...courseModules].sort(
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
    )[0];
  }, [courseModules]);

  // Per-module completion stats derived from student mastery data
  const moduleStats = useMemo(() => {
    const stats: Record<string, { completed: number; total: number; struggling: number }> = {};
    for (const module of courseModules) {
      const total = students?.length ?? 0;
      const completed =
        students?.filter((s) =>
          s.module_mastery.some(
            (m) => m.module_id === module.id && m.status !== "incomplete",
          ),
        ).length ?? 0;
      const struggling =
        students?.filter((s) =>
          s.module_mastery.some(
            (m) => m.module_id === module.id && m.status === "struggling",
          ),
        ).length ?? 0;
      stats[module.id] = { completed, total, struggling };
    }
    return stats;
  }, [courseModules, students]);

  const isLoading = courseLoading || modulesLoading;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-800" />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-2">Course not found</h1>
          <p className="text-muted-foreground mb-4">
            This course does not exist in the current instructor workspace.
          </p>
          <Button asChild>
            <Link href="/courses">Back to courses</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const permissions = getCoursePermissions(
    normalizeCourseMembershipRole(course.membership_role),
  );

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          {/* Course Header with tabs */}
          <CourseHeader
            courseId={courseId}
            courseName={course.title}
            membershipRole={normalizeCourseMembershipRole(
              course.membership_role,
            )}
          />

          {/* Content area */}
          <div className="flex flex-col gap-8 items-center justify-center px-4">
            {/* Full-width New Module button (instructor/ta only) */}
            {permissions.canCreateModules && (
              <Button size="wide" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="size-6" />
              </Button>
            )}

            {courseModules.length === 0 ? (
              /* Empty state */
              <p className="font-heading text-2xl font-medium tracking-[-0.48px] text-primary/80 text-center">
                No modules yet
              </p>
            ) : (
              /* Populated state */
              <div className="flex flex-col gap-4 w-full">
                {/* Current Module section */}
                <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary/80">
                  Current Module
                </h2>

                <div className="flex flex-col gap-8 w-full">
                  {/* Current (most recent) module - expanded */}
                  {currentModule && (
                    <CourseModuleCard
                      module={currentModule}
                      courseId={courseId}
                      stats={moduleStats[currentModule.id] ?? { completed: 0, total: 0, struggling: 0 }}
                      variant="expanded"
                      goalScores={{}} // TODO: populate from backend per-goal aggregation endpoint
                    />
                  )}

                  {/* Separator */}
                  {courseModules.length > 1 && (
                    <hr className="border-t border-dashed border-border" />
                  )}

                  {/* Remaining modules - condensed */}
                  {courseModules.length > 1 && (
                    <div className="flex flex-col gap-6">
                      {courseModules
                        .filter((m) => m.id !== currentModule?.id)
                        .map((module) => (
                          <CourseModuleCard
                            key={module.id}
                            module={module}
                            courseId={courseId}
                            stats={moduleStats[module.id] ?? { completed: 0, total: 0, struggling: 0 }}
                            variant="collapsed"
                          />
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {permissions.canCreateModules && (
        <CreateModuleWizard
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          courseId={course.id}
        />
      )}
    </AppShell>
  );
}
