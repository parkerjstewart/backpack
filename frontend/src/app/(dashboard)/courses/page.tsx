"use client";

import { useState, useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import {
  CourseCard,
  CreateCourseDialog,
  JoinCourseDialog,
  PendingInvitationCard,
} from "@/components/courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useCoursesStore, type Course } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";
import { useCourses } from "@/lib/hooks/use-courses";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  useMyPendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
  useMyEnrollmentRequests,
} from "@/lib/hooks/use-invitations";

function isTeachingRole(role?: string | null): boolean {
  return role === "instructor" || role === "ta";
}

export default function CoursesPage() {
  const { setCourses, getCourseColor } = useCoursesStore();
  const { profile } = useUserStore();
  const { currentUser } = useAuthStore();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  const { data: coursesData, isLoading } = useCourses({ archived: false });

  const { data: pendingInvitations } = useMyPendingInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  const { data: myEnrollmentRequests } = useMyEnrollmentRequests();

  useEffect(() => {
    if (coursesData) {
      const localCourses: Course[] = coursesData.map((c) => ({
        id: c.id,
        name: c.title,
        description: c.description ?? undefined,
        archived: c.archived,
        createdAt: c.created,
        updatedAt: c.updated,
        color: getCourseColor(c.id),
        membershipRole: c.membership_role,
      }));
      setCourses(localCourses);
    }
  }, [coursesData, setCourses, getCourseColor]);

  const displayName = currentUser?.name || profile.name;

  const activeCourses: Course[] = (coursesData ?? []).map((c) => ({
    id: c.id,
    name: c.title,
    description: c.description ?? undefined,
    archived: c.archived,
    createdAt: c.created,
    updatedAt: c.updated,
    color: getCourseColor(c.id),
    membershipRole: c.membership_role,
  }));

  const teachingCourses = activeCourses.filter((c) =>
    isTeachingRole(c.membershipRole)
  );
  const enrolledCourses = activeCourses.filter(
    (c) => c.membershipRole === "student"
  );

  const hasMembershipData = activeCourses.some((c) => c.membershipRole);

  const sections = hasMembershipData
    ? [
        { label: "Teaching", courses: teachingCourses },
        { label: "Enrolled", courses: enrolledCourses },
      ]
    : null;

  const pendingEnrollmentRequests = myEnrollmentRequests?.filter(
    (r) => r.status === "requested"
  );

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
          <div className="flex items-center justify-center pt-[var(--hero-padding-top)] pb-[var(--hero-padding-bottom)] w-full">
            <h1 className="text-hero text-center">
              Welcome back, {displayName}!
            </h1>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
              + Create New Course
            </Button>
            <Button variant="outline" onClick={() => setJoinDialogOpen(true)}>
              + Join a Course
            </Button>
          </div>

          {pendingInvitations && pendingInvitations.length > 0 && (
            <div className="flex flex-col gap-4 mt-4">
              <h2 className="text-title text-teal-800">Pending Invitations</h2>
              <div className="flex flex-col gap-3">
                {pendingInvitations.map((invitation) => (
                  <PendingInvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    onAccept={(id) => acceptInvitation.mutate(id)}
                    onDecline={(id) => declineInvitation.mutate(id)}
                    isAccepting={acceptInvitation.isPending}
                    isDeclining={declineInvitation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingEnrollmentRequests && pendingEnrollmentRequests.length > 0 && (
            <div className="flex flex-col gap-4 mt-4">
              <h2 className="text-title text-teal-800">Enrollment Requests</h2>
              <div className="flex flex-col gap-3">
                {pendingEnrollmentRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-6 rounded-xl border border-border bg-white px-6 py-4"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-lg font-medium tracking-[-0.18px] text-primary truncate">
                        {req.course_title || req.course_id}
                      </span>
                      <span className="text-sm text-primary/60">
                        Enrollment request pending approval
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0 italic">
                      Awaiting approval
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sections ? (
            sections.map(
              (section) =>
                section.courses.length > 0 && (
                  <div key={section.label} className="flex flex-col gap-4 mt-4">
                    <h2 className="text-title text-teal-800">{section.label}</h2>
                    <div className="flex flex-wrap gap-6">
                      {section.courses.map((course) => (
                        <CourseCard key={course.id} course={course} />
                      ))}
                    </div>
                  </div>
                )
            )
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              <h2 className="text-title text-teal-800">Courses</h2>
              {activeCourses.length > 0 ? (
                <div className="flex flex-wrap gap-6">
                  {activeCourses.map((course) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              ) : (
                <p className="text-body text-muted-foreground">
                  No courses yet. Create a course or join one with a course ID.
                </p>
              )}
            </div>
          )}

          {sections &&
            teachingCourses.length === 0 &&
            enrolledCourses.length === 0 && (
              <div className="flex flex-col gap-4 mt-4">
                <p className="text-body text-muted-foreground">
                  No courses yet. Create a course or join one with a course ID.
                </p>
              </div>
            )}
        </div>
      </div>

      <CreateCourseDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      <JoinCourseDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />
    </AppShell>
  );
}
