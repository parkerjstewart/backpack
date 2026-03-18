'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import { InsightsSummaryPanel } from '@/components/insights/InsightsSummaryPanel'
import { PracticeRecommendations } from '@/components/insights/PracticeRecommendations'
import { GoalInsightDetail } from '@/components/insights/GoalInsightDetail'
import { cn } from '@/lib/utils'
import type { StudentProgressResponse } from '@/lib/types/api'

interface InsightSummaryCardProps {
  progress: StudentProgressResponse
  courseId: string
  moduleId: string
}

export function InsightSummaryCard({ progress }: InsightSummaryCardProps) {
  const [expanded, setExpanded] = useState(false)

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
    <Card className="border-border overflow-hidden">
      {/* Clickable header — always visible */}
      <button
        type="button"
        className="w-full text-left p-6 hover:bg-secondary transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Title row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
              Your Session Insights
            </h2>
            {sessionDate && (
              <p className="text-sm text-muted-foreground mt-0.5">{sessionDate}</p>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200',
              expanded && 'rotate-180'
            )}
          />
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

        {/* Per-goal rows */}
        {progress.goal_insights.length > 0 && (
          <div className="space-y-2">
            {progress.goal_insights.map((goal) => {
              const isStrongest = goal.goal_id === progress.strongest_goal_id
              const isWeakest = goal.goal_id === progress.weakest_goal_id
              const masteredCount = goal.competency_results.filter(
                (c) => c.status === 'mastered' || c.status === 'explained'
              ).length
              const totalCount = goal.competency_results.length

              return (
                <div
                  key={goal.goal_id}
                  className="flex items-center gap-3 rounded-md bg-background/60 px-4 py-2.5"
                >
                  <span
                    className="shrink-0 w-12 text-center text-xs font-semibold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: goalBadgeColor(goal.final_score) }}
                  >
                    {Math.round(goal.final_score * 100)}%
                  </span>
                  <span className="flex-1 text-sm text-primary truncate">
                    {goal.goal_description}
                  </span>
                  {totalCount > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {masteredCount}/{totalCount} competencies
                    </span>
                  )}
                  {isStrongest && (
                    <TrendingUp className="shrink-0 h-4 w-4 text-sage-600" aria-label="Strongest goal" />
                  )}
                  {isWeakest && (
                    <TrendingDown className="shrink-0 h-4 w-4 text-coral-500" aria-label="Needs work" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </button>

      {/* Expandable body */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-6 pt-2 space-y-6 border-t border-border">
            {/* Two-column top: summary panel + practice recommendations */}
            <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-6 items-start">
              <div className="bg-secondary rounded-lg p-4">
                <InsightsSummaryPanel
                  goalInsights={progress.goal_insights}
                  overallSummary={progress.overall_summary}
                  strongestGoalId={progress.strongest_goal_id}
                  weakestGoalId={progress.weakest_goal_id}
                />
              </div>
              <div className="bg-secondary rounded-lg p-4">
                <PracticeRecommendations goalInsights={progress.goal_insights} />
              </div>
            </div>

            {/* Breakdown */}
            {progress.goal_insights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {progress.goal_insights.map((goal) => (
                    <GoalInsightDetail
                      key={goal.goal_id}
                      goal={goal}
                      isStrongest={goal.goal_id === progress.strongest_goal_id}
                      isWeakest={goal.goal_id === progress.weakest_goal_id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
