'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown, ChevronRight, GraduationCap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import type { StudentProgressResponse } from '@/lib/types/api'

interface InsightSummaryCardProps {
  progress: StudentProgressResponse
  courseId: string
  moduleId: string
}

export function InsightSummaryCard({ progress, courseId, moduleId }: InsightSummaryCardProps) {
  const insightsHref = `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/insights`

  const sessionDate = progress.created
    ? new Date(progress.created).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <Card className="p-6 space-y-4 border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
            Your Session Insights
          </h2>
          {sessionDate && (
            <p className="text-sm text-muted-foreground mt-0.5">{sessionDate}</p>
          )}
        </div>
        <Link
          href={insightsHref}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View full report
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Overall summary */}
      {progress.overall_summary && (
        <p className="text-sm text-foreground leading-relaxed">
          {progress.overall_summary}
        </p>
      )}

      {/* Per-goal breakdown */}
      {progress.goal_insights.length > 0 && (
        <div className="space-y-2">
          {progress.goal_insights.map((goal) => {
            const masteredCount = goal.competency_results.filter(
              (c) => c.status === 'mastered' || c.status === 'explained'
            ).length
            const totalCount = goal.competency_results.length
            const isStrongest = goal.goal_id === progress.strongest_goal_id
            const isWeakest = goal.goal_id === progress.weakest_goal_id

            return (
              <div
                key={goal.goal_id}
                className="flex items-center gap-3 rounded-md bg-secondary px-4 py-2.5"
              >
                {/* Score badge */}
                <span
                  className="shrink-0 w-12 text-center text-xs font-semibold rounded-full px-2 py-0.5"
                  style={{ backgroundColor: goalBadgeColor(goal.final_score) }}
                >
                  {Math.round(goal.final_score * 100)}%
                </span>

                {/* Goal description */}
                <span className="flex-1 text-sm text-primary truncate">
                  {goal.goal_description}
                </span>

                {/* Competency count */}
                {totalCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {masteredCount}/{totalCount} competencies
                  </span>
                )}

                {/* Strongest/weakest indicator */}
                {isStrongest && (
                  <TrendingUp className="shrink-0 h-4 w-4 text-sage-600" aria-label="Strongest goal" />
                )}
                {isWeakest && (
                  <TrendingDown className="shrink-0 h-4 w-4 text-coral-500" aria-label="Weakest goal" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <Button asChild variant="secondary">
          <Link href={insightsHref}>
            View Full Insights
          </Link>
        </Button>
        <Button asChild>
          <Link href={`/modules/${encodeURIComponent(moduleId)}/review`}>
            <GraduationCap className="h-4 w-4" />
            Start New Session
          </Link>
        </Button>
      </div>
    </Card>
  )
}
