'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { CourseHeader } from '@/components/courses'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { GoalInsightDetail } from '@/components/insights/GoalInsightDetail'
import { useCourse } from '@/lib/hooks/use-courses'
import { useModule } from '@/lib/hooks/use-modules'
import { useStudentProgressForStudent } from '@/lib/hooks/use-student-progress'

export default function InstructorStudentInsightsPage() {
  const params = useParams()
  const courseId = params?.courseId ? decodeURIComponent(params.courseId as string) : ''
  const studentId = params?.studentId ? decodeURIComponent(params.studentId as string) : ''
  const moduleId = params?.moduleId ? decodeURIComponent(params.moduleId as string) : ''

  const { data: course } = useCourse(courseId)
  const { data: module } = useModule(moduleId)
  const { data: sessions, isLoading } = useStudentProgressForStudent(moduleId, studentId)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const session = sessions?.[selectedIndex] ?? null

  const studentsHref = `/courses/${encodeURIComponent(courseId)}/students`

  return (
    <AppShell>
      {course && (
        <CourseHeader
          courseId={courseId}
          courseName={course.title}
        />
      )}

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Back link */}
        <Link
          href={studentsHref}
          className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </Link>

        {/* Page title */}
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-[-0.3px] text-primary">
            Student Insights
          </h1>
          {module?.name && (
            <p className="text-muted-foreground mt-1">{module.name}</p>
          )}
        </div>

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

            {/* Overall summary */}
            {session.overall_summary && (
              <div className="bg-secondary rounded-lg p-5 space-y-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Session Summary
                </h2>
                <p className="text-sm text-foreground leading-relaxed">
                  {session.overall_summary}
                </p>
                {session.created && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {new Date(session.created).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Per-goal details */}
            <div className="space-y-8">
              {session.goal_insights.map((goal) => (
                <div key={goal.goal_id} className="border border-border rounded-lg p-6">
                  <GoalInsightDetail
                    goal={goal}
                    isStrongest={goal.goal_id === session.strongest_goal_id}
                    isWeakest={goal.goal_id === session.weakest_goal_id}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
