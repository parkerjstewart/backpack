"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/ui/form-label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CourseHeader, LeaveCourseDialog } from "@/components/courses";
import { toast } from "sonner";
import {
  useCourse,
  useUpdateCourse,
  useDeleteCourse,
} from "@/lib/hooks/use-courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import {
  getCoursePermissions,
  normalizeCourseMembershipRole,
} from "@/lib/permissions/course";

export default function CourseSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { data: course, isLoading } = useCourse(courseId);
  const updateCourse = useUpdateCourse(courseId);
  const deleteCourse = useDeleteCourse();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  useEffect(() => {
    if (course) {
      setTitle(course.title);
      setDescription(course.description ?? "");
    }
  }, [course]);

  const isDirty =
    course !== undefined &&
    (title !== course.title || description !== (course.description ?? ""));

  const isTitleValid = title.trim().length > 0;

  const handleSaveDetails = () => {
    if (!isDirty || !isTitleValid) return;
    updateCourse.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
    });
  };

  const handleToggleArchive = () => {
    if (!course) return;
    updateCourse.mutate(
      { archived: !course.archived },
      { onSuccess: () => setArchiveDialogOpen(false) },
    );
  };

  const handleDeleteCourse = () => {
    deleteCourse.mutate(courseId, {
      onSuccess: () => {
        router.push("/courses");
      },
    });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Course not found</p>
        </div>
      </AppShell>
    );
  }

  const permissions = getCoursePermissions(
    normalizeCourseMembershipRole(course.membership_role),
  );
  if (!permissions.canManageCourseSettings) {
    return (
      <AppShell>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-8 p-8">
            <CourseHeader
              courseId={courseId}
              courseName={course.title}
              membershipRole={normalizeCourseMembershipRole(
                course.membership_role,
              )}
            />
            {permissions.canLeaveCourse ? (
              <Card className="max-w-2xl border-destructive/20">
                <CardHeader>
                  <CardTitle>Leave Course</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                      Leaving this course will remove your access to all course
                      materials. You can request to rejoin later with the course
                      ID.
                    </p>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="destructive"
                        onClick={() => setLeaveDialogOpen(true)}
                      >
                        Leave Course
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="max-w-2xl">
                <CardHeader>
                  <CardTitle>Settings are instructor-only</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-end">
                    <Button asChild variant="outline">
                      <Link href={`/courses/${encodeURIComponent(courseId)}`}>
                        Back to course
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {permissions.canLeaveCourse && (
          <LeaveCourseDialog
            open={leaveDialogOpen}
            onOpenChange={setLeaveDialogOpen}
            courseId={courseId}
            courseTitle={course.title}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          <CourseHeader
            courseId={courseId}
            courseName={course.title}
            membershipRole={normalizeCourseMembershipRole(
              course.membership_role,
            )}
          />

          <div className="flex flex-col gap-8 max-w-2xl">
            {/* Course ID — share this with students */}
            <Card>
              <CardHeader>
                <CardTitle>Course ID</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    Share this ID with students so they can request to join your course.
                  </p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-mono text-primary select-all">
                      {courseId}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(courseId)
                          .then(() => toast.success("Course ID copied"))
                          .catch(() => toast.error("Failed to copy — please copy it manually"))
                      }
                      className="shrink-0 gap-1.5"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Course Details form */}
            <Card>
              <CardHeader>
                <CardTitle>Course Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-3">
                    <FormLabel htmlFor="course-title">Course Name</FormLabel>
                    <Input
                      id="course-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. CS 101"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <FormLabel htmlFor="course-description">
                      Description
                    </FormLabel>
                    <Textarea
                      id="course-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A brief description of this course"
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant={isDirty && isTitleValid ? "accent" : "light"}
                      onClick={handleSaveDetails}
                      disabled={
                        !isDirty || !isTitleValid || updateCourse.isPending
                      }
                    >
                      {updateCourse.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              {/* Archive button + confirmation dialog */}
              <AlertDialog
                open={archiveDialogOpen}
                onOpenChange={setArchiveDialogOpen}
              >
                <Button
                  variant="light"
                  onClick={() => setArchiveDialogOpen(true)}
                  disabled={updateCourse.isPending}
                >
                  {course.archived ? (
                    <>
                      <ArchiveRestore className="size-4" />
                      Unarchive Course
                    </>
                  ) : (
                    <>
                      <Archive className="size-4" />
                      Archive Course
                    </>
                  )}
                </Button>
                <AlertDialogContent>
                  <AlertDialogTitle>
                    {course.archived
                      ? "Unarchive this course?"
                      : "Archive this course?"}
                  </AlertDialogTitle>

                  <AlertDialogDescription>
                    {course.archived
                      ? `Unarchiving "${course.title}" will make it visible in your active courses list again.`
                      : `Archiving "${course.title}" will hide it from your active courses list. Students and modules are preserved and you can unarchive.`}
                  </AlertDialogDescription>

                  <div className="flex items-center justify-center gap-[15px]">
                    <Button
                      variant="outline"
                      onClick={() => setArchiveDialogOpen(false)}
                      disabled={updateCourse.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      onClick={handleToggleArchive}
                      disabled={updateCourse.isPending}
                    >
                      {updateCourse.isPending
                        ? course.archived
                          ? "Unarchiving..."
                          : "Archiving..."
                        : course.archived
                          ? "Unarchive"
                          : "Archive"}
                    </Button>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              {/* Delete button + confirmation dialog */}
              <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
              >
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteCourse.isPending}
                >
                  <Trash2 className="size-4" />
                  {deleteCourse.isPending ? "Deleting..." : "Delete Course"}
                </Button>
                <AlertDialogContent>
                  <AlertDialogTitle>
                    Delete &ldquo;{course.title}&rdquo;?
                  </AlertDialogTitle>

                  <AlertDialogDescription>
                    This action cannot be undone. Your modules and students will
                    be permenantly deleted.
                  </AlertDialogDescription>

                  <div className="flex items-center justify-center gap-[15px]">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteDialogOpen(false)}
                      disabled={deleteCourse.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteCourse}
                      disabled={deleteCourse.isPending}
                    >
                      {deleteCourse.isPending ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
