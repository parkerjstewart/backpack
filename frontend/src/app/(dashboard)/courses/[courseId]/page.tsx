"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseHeader, AddExistingModuleDialog } from "@/components/courses";
import { useModules, useUpdateModule } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useCourse } from "@/lib/hooks/use-courses";
import { CreateModuleWizard } from "@/components/modules/CreateModuleWizard";
import { useState, useMemo, useEffect } from "react";

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
  const [addExistingDialogOpen, setAddExistingDialogOpen] = useState(false);

  // Filter modules that belong to this course
  // Check both the backend course_id field and the legacy store-based mapping
  const courseModules = useMemo(
    () => (modules ?? []).filter((m) =>
      m.course_id === courseId || moduleCourseMap[m.id] === courseId
    ),
    [modules, moduleCourseMap, courseId]
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
      (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
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

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          {/* Course Header with tabs */}
          <CourseHeader courseId={courseId} courseName={course.title} />

          {/* Current module summary */}
          <Card>
            <CardHeader>
              <CardTitle>Current Module</CardTitle>
            </CardHeader>
            <CardContent>
              {currentModule ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">{currentModule.name}</h2>
                      {currentModule.description && (
                        <p className="text-sm text-muted-foreground">
                          {currentModule.description}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" asChild>
                      <Link
                        href={`/courses/${encodeURIComponent(
                          course.id
                        )}/modules/${encodeURIComponent(currentModule.id)}`}
                      >
                        View details
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This course does not have any modules yet. Create a module to
                  get started.
                </p>
              )}
            </CardContent>
          </Card>

          {/* All modules in this course */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                All Modules ({courseModules.length})
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddExistingDialogOpen(true)}
                >
                  Add Existing
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  New Module
                </Button>
              </div>
            </div>

            {courseModules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
                <p className="text-muted-foreground mb-4">
                  No modules in this course yet
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAddExistingDialogOpen(true)}
                  >
                    Add Existing Module
                  </Button>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    Create New Module
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courseModules.map((module) => (
                  <Link
                    key={module.id}
                    href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(module.id)}`}
                    className="block p-4 border rounded-lg hover:bg-secondary transition-colors"
                  >
                    <h3 className="font-semibold">{module.name}</h3>
                    {module.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {module.description}
                      </p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{module.source_count} sources</span>
                      <span>{module.note_count} notes</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateModuleWizard
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        courseId={course.id}
      />

      <AddExistingModuleDialog
        open={addExistingDialogOpen}
        onOpenChange={setAddExistingDialogOpen}
        courseId={courseId}
      />
    </AppShell>
  );
}
