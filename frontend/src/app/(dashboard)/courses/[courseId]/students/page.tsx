"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CourseHeader,
  InviteDialog,
  StudentListRow,
  StudentProfileCard,
} from "@/components/courses";
import {
  useCourse,
  useCourseStudents,
  useCourseTeachingTeam,
  useCourseNeedsAttention,
  useRemoveCourseMember,
} from "@/lib/hooks/use-courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export default function CourseStudentsPage() {
  const params = useParams();
  const courseId = params.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: students, isLoading: studentsLoading } = useCourseStudents(courseId);
  const { data: teachingTeam, isLoading: teamLoading } = useCourseTeachingTeam(courseId);
  const { data: needsAttention, isLoading: attentionLoading } = useCourseNeedsAttention(courseId);

  const removeMember = useRemoveCourseMember(courseId);

  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"student" | "instructor" | "ta">("student");

  const isLoading = courseLoading || studentsLoading || teamLoading || attentionLoading;

  // Filter students by search query
  const filteredStudents = students?.filter((student) => {
    const query = searchQuery.toLowerCase();
    return (
      student.name?.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query)
    );
  });

  const openInviteDialog = (role: "student" | "instructor" | "ta") => {
    setInviteRole(role);
    setInviteDialogOpen(true);
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

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-8">
          {/* Course Header with tabs */}
          <CourseHeader courseId={courseId} courseName={course.title} />

          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search for people"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Needs Attention section */}
          {needsAttention && needsAttention.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-title text-teal-800">Needs Attention</h2>
              <div className="flex flex-wrap gap-2">
                {needsAttention.map((student) => (
                  <StudentProfileCard
                    key={student.id}
                    name={student.name}
                    email={student.email}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Teaching Team section */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-title text-teal-800">Teaching Team</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openInviteDialog("instructor")}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {teachingTeam && teachingTeam.length > 0 ? (
                teachingTeam.map((member) => (
                  <StudentProfileCard
                    key={member.id}
                    name={member.name}
                    email={member.email}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No teaching team members yet
                </p>
              )}
            </div>
          </section>

          {/* All Students section */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-title text-teal-800">
                All Students ({filteredStudents?.length ?? 0})
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openInviteDialog("student")}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Add Student
              </Button>
            </div>

            {filteredStudents && filteredStudents.length > 0 ? (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
                {filteredStudents.map((student) => (
                  <StudentListRow
                    key={student.id}
                    name={student.name}
                    email={student.email}
                    moduleMastery={student.module_mastery}
                    onRemove={() => removeMember.mutate(student.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? "No students match your search"
                    : "No students enrolled yet"}
                </p>
                {!searchQuery && (
                  <Button
                    variant="outline"
                    onClick={() => openInviteDialog("student")}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Student
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        courseId={courseId}
        defaultRole={inviteRole}
      />
    </AppShell>
  );
}
