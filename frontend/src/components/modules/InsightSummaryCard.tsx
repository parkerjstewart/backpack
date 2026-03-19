'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import { useLearningGoals } from '@/lib/hooks/use-modules'
import type { StudentProgressResponse } from '@/lib/types/api'

interface InsightSummaryCardProps {
  progress: StudentProgressResponse
  courseId: string
  moduleId: string
  studentName?: string
  href: string
}

export function InsightSummaryCard({
  progress,
  moduleId,
  studentName,
  href,
}: InsightSummaryCardProps) {
  const { data: learningGoals } = useLearningGoals(moduleId)
  const goalTitleMap = Object.fromEntries(
    (learningGoals ?? []).map((g) => [g.id, g.title])
  )

  const sessionDate = progress.created
    ? new Date(progress.created).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  const overallScore =
    progress.goal_insights.length > 0
      ? progress.goal_insights.reduce((sum, g) => sum + g.final_score, 0) /
        progress.goal_insights.length
      : 0

  const overallPct = Math.round(overallScore * 100)

  return (
    <Card className="border-border overflow-hidden py-0 hover:bg-secondary transition-colors cursor-pointer">
      <Link href={href} className="block w-full text-left p-6">
        {/* Title row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-card-title text-primary">
              {studentName ? `${studentName}'s Session Insights` : 'Your Session Insights'}
            </h2>
            {sessionDate && (
              <p className="text-sm text-muted-foreground mt-0.5">{sessionDate}</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>

        {/* Overall score bar */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Overall</span>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${overallPct}%`,
                backgroundColor: goalBadgeColor(overallScore),
              }}
            />
          </div>
          <span
            className="shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: goalBadgeColor(overallScore) }}
          >
            {overallPct}%
          </span>
        </div>

        {/* Per-goal badges */}
        {progress.goal_insights.length > 0 && (
          <div className="flex overflow-x-auto gap-2 pb-1">
            {progress.goal_insights.map((goal) => {
              const pct = Math.round(goal.final_score * 100)
              const title = goalTitleMap[goal.goal_id]
              const label = title
                ? `${title} · ${pct}%`
                : `${pct}%`
              return (
                <Tooltip key={goal.goal_id}>
                  <TooltipTrigger asChild>
                    <span
                      className="shrink-0 inline-block rounded-lg px-2.5 py-1.5 text-body-sm text-primary cursor-default whitespace-nowrap"
                      style={{ backgroundColor: goalBadgeColor(goal.final_score) }}
                    >
                      {label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {goal.goal_description}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}
      </Link>
    </Card>
  )
}
