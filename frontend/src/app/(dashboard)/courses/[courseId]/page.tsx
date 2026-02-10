"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseHeader } from "@/components/courses";
import { useModules, useUpdateModule } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useCourse } from "@/lib/hooks/use-courses";
import { CreateModuleWizard } from "@/components/modules/CreateModuleWizard";
import { useState, useMemo, useEffect } from "react";
import { getCoursePermissions } from "@/lib/permissions/course";

export default function CoursePage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { moduleCourseMap } = useCoursesStore();

  // Fetch course from backend API
  const { data: course, isLoading: courseLoading } = useCourse(courseId);

  const { data: modules, isLoading: modulesLoading } = useModules(false);
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

  const permissions = getCoursePermissions(course.membership_role);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          {/* Course Header with tabs */}
          <CourseHeader
            courseId={courseId}
            courseName={course.title}
            membershipRole={course.membership_role}
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
                    <Link
                      href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(currentModule.id)}`}
                      className="block border border-border rounded-lg px-6 py-4 bg-white hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-[18px] font-medium tracking-[-0.18px]">
                          {currentModule.name}
                        </h3>
                      </div>
                      {currentModule.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {currentModule.description}
                        </p>
                      )}
                      <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
                        <span>{currentModule.source_count} sources</span>
                        <span>{currentModule.note_count} notes</span>
                      </div>
                    </Link>
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
                          <Link
                            key={module.id}
                            href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(module.id)}`}
                            className="block border border-border rounded-lg px-6 py-4 hover:bg-secondary transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-[18px] font-medium tracking-[-0.18px]">
                                {module.name}
                              </h3>
                            </div>
                            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                              <span>{module.source_count} sources</span>
                              <span>{module.note_count} notes</span>
                            </div>
                          </Link>
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
