"use client";

import { useState, useEffect } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseCard, CreateCourseDialog, PendingInvitationCard } from "@/components/courses";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useCoursesStore, type Course } from "@/lib/stores/courses-store";
import { useUserStore } from "@/lib/stores/user-store";
import { useCourses } from "@/lib/hooks/use-courses";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  useMyPendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
} from "@/lib/hooks/use-invitations";

function isTeachingRole(role?: string | null): boolean {
  return role === "instructor" || role === "ta";
}

export default function CoursesPage() {
  const { setCourses, getCourseColor } = useCoursesStore();
  const { profile } = useUserStore();
  const { currentUser } = useAuthStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch courses from backend
  const { data: coursesData, isLoading } = useCourses({ archived: false });

  // Fetch pending invitations for the current user
  const { data: pendingInvitations } = useMyPendingInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  // Sync backend courses to local store (for color management + membership role)
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

  // Get display name
  const displayName = currentUser?.name || profile.name;

  // Convert backend courses to local format for CourseCard
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

  // Split courses by role
  const teachingCourses = activeCourses.filter((c) =>
    isTeachingRole(c.membershipRole)
  );
  const enrolledCourses = activeCourses.filter(
    (c) => c.membershipRole === "student"
  );

  // Determine if we have role-based data
  const hasMembershipData = activeCourses.some((c) => c.membershipRole);

  const sections = hasMembershipData
    ? [
        { label: "Teaching", courses: teachingCourses },
        { label: "Enrolled", courses: enrolledCourses },
      ]
    : null;

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
        {/* Main content container with 32px padding (design system --page-padding) */}
        <div className="flex flex-col gap-4 p-8">
          {/* Hero section - centered welcome text */}
          <div className="flex items-center justify-center pt-[var(--hero-padding-top)] pb-[var(--hero-padding-bottom)] w-full">
            <h1 className="text-hero text-center">
              Welcome back, {displayName}!
            </h1>
          </div>

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              + Create New Course
            </Button>
          </div>

          {/* Pending invitations */}
          {pendingInvitations && pendingInvitations.length > 0 && (
            <div className="flex flex-col gap-4 mt-4">
              <h2 className="text-title text-teal-800">
                Pending Invitations
              </h2>
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

          {/* Courses sections */}
          {sections ? (
            // Role-based sectioned view
            sections.map(
              (section) =>
                section.courses.length > 0 && (
                  <div
                    key={section.label}
                    className="flex flex-col gap-4 mt-4"
                  >
                    <h2 className="text-title text-teal-800">
                      {section.label}
                    </h2>
                    <div className="flex flex-wrap gap-6">
                      {section.courses.map((course) => (
                        <CourseCard key={course.id} course={course} />
                      ))}
                    </div>
                  </div>
                )
            )
          ) : (
            // Unsectioned fallback (no membership data)
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
                  No courses yet. Use &quot;Create New Course&quot; to get
                  started.
                </p>
              )}
            </div>
          )}

          {/* Show empty state if both sections are empty */}
          {sections &&
            teachingCourses.length === 0 &&
            enrolledCourses.length === 0 && (
              <div className="flex flex-col gap-4 mt-4">
                <p className="text-body text-muted-foreground">
                  No courses yet. Use &quot;Create New Course&quot; to get
                  started.
                </p>
              </div>
            )}
        </div>
      </div>

      <CreateCourseDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  );
}
