"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { ArchiveRestore } from "lucide-react";

export default function ArchivedPage() {
  const { courses, archiveCourse } = useCoursesStore();

  const archivedCourses = courses.filter((course) => course.archived);

  const handleRestore = (courseId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    archiveCourse(courseId, false);
  };

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-title">Archived Classes</h1>
            <p className="text-muted-foreground">
              Classes you&apos;ve archived. You can restore them at any time.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {archivedCourses.map((course) => (
              <Card
                key={course.id}
                className="h-full transition-colors hover:bg-secondary"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{course.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleRestore(course.id, e)}
                      className="shrink-0"
                      title="Restore class"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  </div>
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {course.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Last updated{" "}
                    {new Date(course.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}

            {archivedCourses.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground mb-4">
                  No archived classes.
                </p>
                <Link href="/courses">
                  <Button variant="outline">Back to Classes</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
