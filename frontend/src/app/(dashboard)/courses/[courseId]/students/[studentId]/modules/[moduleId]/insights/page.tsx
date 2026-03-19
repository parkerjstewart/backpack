'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { CourseHeader } from '@/components/courses'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { InsightsSummaryPanel } from '@/components/insights/InsightsSummaryPanel'
import { PracticeRecommendations } from '@/components/insights/PracticeRecommendations'
import { GoalInsightDetail } from '@/components/insights/GoalInsightDetail'
import { useCourse } from '@/lib/hooks/use-courses'
import { useModule, useLearningGoals } from '@/lib/hooks/use-modules'
import { useStudentProgressForStudent } from '@/lib/hooks/use-student-progress'
import { usersApi } from '@/lib/api/users'
import { normalizeCourseMembershipRole } from '@/lib/permissions/course'

export default function InstructorStudentInsightsPage() {
  const params = useParams()
  const courseId = params?.courseId ? decodeURIComponent(params.courseId as string) : ''
  const rawStudentId = params?.studentId ? decodeURIComponent(params.studentId as string) : ''
  const moduleId = params?.moduleId ? decodeURIComponent(params.moduleId as string) : ''

  // The URL uses the bare ID; the API expects "user:<id>"
  const studentId = rawStudentId.includes(':') ? rawStudentId : `user:${rawStudentId}`

  const { data: course } = useCourse(courseId)
  const { data: module } = useModule(moduleId)
  const { data: learningGoals = [] } = useLearningGoals(moduleId)
  const { data: student } = useQuery({
    queryKey: ['user', studentId],
    queryFn: () => usersApi.get(studentId),
    enabled: !!studentId,
  })
  const { data: sessions, isLoading } = useStudentProgressForStudent(moduleId, studentId)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const session = sessions?.[selectedIndex] ?? null

  const goalTitleMap = Object.fromEntries(learningGoals.map((g) => [g.id, g.title]))
  const studentName = student?.name || student?.email || 'Student'
  const moduleHref = `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 px-8 pt-8">
          {course && (
            <CourseHeader
              courseId={courseId}
              courseName={course.title}
              membershipRole={normalizeCourseMembershipRole(course.membership_role)}
              moduleName={module?.name}
              moduleId={moduleId}
              pageName={`${studentName}'s Insights`}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
            {/* Back link */}
            <Link
              href={moduleHref}
              className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to module
            </Link>

          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!isLoading && (!sessions || sessions.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <p>This student has not completed any tutor sessions for this module yet.</p>
            </div>
          )}

          {session && (
            <>
              {/* Session selector */}
              {sessions && sessions.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Session:</span>
                  <div className="flex gap-1 flex-wrap">
                    {sessions.map((s, i) => {
                      const date = s.created
                        ? new Date(s.created).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : `#${i + 1}`
                      return (
                        <button
                          key={s.session_id}
                          onClick={() => setSelectedIndex(i)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            selectedIndex === i
                              ? 'bg-primary text-white border-primary'
                              : 'border-border hover:bg-secondary'
                          }`}
                        >
                          {i === 0 ? `Latest (${date})` : date}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Overview + practice recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-6 items-start">
                <div className="flex flex-col gap-3">
                  <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
                    Overview
                  </h2>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <InsightsSummaryPanel
                      goalInsights={session.goal_insights}
                      overallSummary={session.overall_summary}
                      strongestGoalId={session.strongest_goal_id}
                      weakestGoalId={session.weakest_goal_id}
                      goalTitleMap={goalTitleMap}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
                    Get more practice with
                  </h2>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <PracticeRecommendations goalInsights={session.goal_insights} />
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="flex flex-col gap-3">
                <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
                  Breakdown
                </h2>
                <div className="space-y-4">
                  {session.goal_insights.map((goal) => (
                    <GoalInsightDetail
                      key={goal.goal_id}
                      goal={goal}
                      goalTitle={goalTitleMap[goal.goal_id]}
                      isStrongest={goal.goal_id === session.strongest_goal_id}
                      isWeakest={goal.goal_id === session.weakest_goal_id}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
