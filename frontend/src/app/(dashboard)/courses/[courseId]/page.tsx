"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseHeader } from "@/components/courses";
import { useModules } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { useCourse } from "@/lib/hooks/use-courses";
import { CreateModuleWizard } from "@/components/modules/CreateModuleWizard";
import { ModuleList } from "@/app/(dashboard)/modules/components/ModuleList";
import { useState, useMemo } from "react";

export default function CoursePage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { moduleCourseMap } = useCoursesStore();

  // Fetch course from backend API
  const { data: course, isLoading: courseLoading } = useCourse(courseId);

  const { data: modules, isLoading: modulesLoading } = useModules(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const courseModules = useMemo(
    () => (modules ?? []).filter((m) => moduleCourseMap[m.id] === courseId),
    [modules, moduleCourseMap, courseId]
  );

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
          <div>
            <ModuleList
              modules={courseModules}
              isLoading={isLoading}
              title="All Modules"
              emptyTitle="No modules in this course yet"
              emptyDescription="Create a new module to start adding content for this course."
              onAction={() => setCreateDialogOpen(true)}
              actionLabel="New Module"
            />
          </div>
        </div>
      </div>

      <CreateModuleWizard
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        courseId={course.id}
      />
    </AppShell>
  );
}
