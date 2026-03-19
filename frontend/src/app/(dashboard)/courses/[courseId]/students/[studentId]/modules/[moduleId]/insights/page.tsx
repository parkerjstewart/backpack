'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { CourseHeader } from '@/components/courses'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { InsightSummaryCard } from '@/components/modules/InsightSummaryCard'
import { useCourse } from '@/lib/hooks/use-courses'
import { useModule } from '@/lib/hooks/use-modules'
import { useStudentProgressForStudent } from '@/lib/hooks/use-student-progress'
import { usersApi } from '@/lib/api/users'

export default function InstructorStudentInsightsPage() {
  const params = useParams()
  const courseId = params?.courseId ? decodeURIComponent(params.courseId as string) : ''
  const rawStudentId = params?.studentId ? decodeURIComponent(params.studentId as string) : ''
  const moduleId = params?.moduleId ? decodeURIComponent(params.moduleId as string) : ''

  // The URL uses the bare ID; the API expects "user:<id>"
  const studentId = rawStudentId.includes(':') ? rawStudentId : `user:${rawStudentId}`

  const { data: course } = useCourse(courseId)
  const { data: module } = useModule(moduleId)
  const { data: student } = useQuery({
    queryKey: ['user', studentId],
    queryFn: () => usersApi.get(studentId),
    enabled: !!studentId,
  })
  const { data: sessions, isLoading } = useStudentProgressForStudent(moduleId, studentId)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const session = sessions?.[selectedIndex] ?? null

  const studentName = student?.name || student?.email || 'Student'
  const moduleHref = `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`

  const sessionDate = session?.created
    ? new Date(session.created).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <AppShell>
      {course && (
        <CourseHeader
          courseId={courseId}
          courseName={course.title}
        />
      )}

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Back link */}
        <Link
          href={moduleHref}
          className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to module
        </Link>

        {/* Page title */}
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-[-0.3px] text-primary">
            {student ? `${studentName}'s Insights` : 'Student Insights'}
          </h1>
          {module?.name && (
            <p className="text-muted-foreground mt-1">{module.name}</p>
          )}
          {sessionDate && (
            <p className="text-lg text-muted-foreground mt-1">{sessionDate}</p>
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
          <div className="space-y-4">
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

            <InsightSummaryCard
              progress={session}
              courseId={courseId}
              moduleId={moduleId}
              hideHeader
              defaultExpanded
            />
          </div>
        )}
      </div>
      </div>
    </AppShell>
  )
}
