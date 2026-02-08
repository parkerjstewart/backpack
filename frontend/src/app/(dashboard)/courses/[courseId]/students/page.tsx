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
import {
  useCourseInvitations,
  useCancelInvitation,
  useCreateInvitation,
} from "@/lib/hooks/use-invitations";
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
  const { data: pendingInvitations } = useCourseInvitations(courseId);
  const cancelInvitation = useCancelInvitation(courseId);
  const resendInvitation = useCreateInvitation(courseId);

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
              <div className="flex flex-wrap gap-6">
                {needsAttention.map((student) => (
                  <StudentProfileCard
                    key={student.id}
                    name={student.name}
                    email={student.email}
                    color="amber"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Teaching Team section */}
          <section className="flex flex-col gap-4">
            <h2 className="text-title text-teal-800">Teaching Team</h2>
            <div className="flex flex-wrap gap-6">
              {teachingTeam?.map((member) => (
                <StudentProfileCard
                  key={member.id}
                  name={member.name}
                  email={member.email}
                  color="sky"
                />
              ))}
              {/* Add Teacher button with dotted outline */}
              <button
                onClick={() => openInviteDialog("instructor")}
                className="flex flex-col items-center gap-2 p-2 group"
              >
                <div className="w-[100px] h-[100px] rounded-full border-2 border-dashed border-teal-300 flex items-center justify-center transition-colors group-hover:border-teal-800 group-hover:bg-secondary">
                  <Plus className="h-8 w-8 text-teal-300 group-hover:text-teal-800 transition-colors" />
                </div>
                <span className="text-base text-teal-300 group-hover:text-teal-800 transition-colors">
                  Add Teacher
                </span>
              </button>
            </div>
          </section>

          {/* All Students section */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-title text-teal-800">
                All Students ({filteredStudents?.length ?? 0})
              </h2>
              <button
                onClick={() => openInviteDialog("student")}
                className="p-1 rounded-lg hover:bg-secondary transition-colors"
                aria-label="Add student"
              >
                <Plus className="h-6 w-6 text-teal-800" />
              </button>
            </div>

            {(filteredStudents && filteredStudents.length > 0) ||
            (pendingInvitations && pendingInvitations.length > 0) ? (
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
                {filteredStudents?.map((student) => (
                  <StudentListRow
                    key={student.id}
                    name={student.name}
                    email={student.email}
                    moduleMastery={student.module_mastery}
                    onRemove={() => removeMember.mutate(student.id)}
                  />
                ))}
                {/* Pending invitation rows (Figma: faded italic style) */}
                {pendingInvitations?.map((inv) => (
                  <StudentListRow
                    key={inv.id}
                    variant="pending"
                    name={inv.name}
                    email={inv.email}
                    onCancel={() => cancelInvitation.mutate(inv.id)}
                    onResend={() =>
                      resendInvitation.mutate({
                        name: inv.name,
                        email: inv.email,
                        role: inv.role as "student" | "instructor" | "ta",
                      })
                    }
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
