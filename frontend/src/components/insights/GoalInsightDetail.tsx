'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import { ScoreProgressionChart } from './ScoreProgressionChart'
import { CompetencyResultsTable } from './CompetencyResultsTable'
import type { GoalInsightResponse } from '@/lib/types/api'

interface GoalInsightDetailProps {
  goal: GoalInsightResponse
  goalTitle?: string
  isStrongest?: boolean
  isWeakest?: boolean
}

export function GoalInsightDetail({ goal, goalTitle, isStrongest, isWeakest }: GoalInsightDetailProps) {
  const color = goalBadgeColor(goal.final_score)

  return (
    <Card
      className="border-border py-4 gap-4"
      style={{ borderLeftWidth: '4px', borderLeftColor: color }}
    >
      <CardHeader className="flex flex-row items-start gap-2 gap-y-1.5 pb-0 px-6">
        <span
          className="shrink-0 mt-0.5 text-xs font-semibold rounded-full px-2.5 py-1"
          style={{ backgroundColor: color }}
        >
          {Math.round(goal.final_score * 100)}%
        </span>
        <div className="flex-1 min-w-0">
          {goalTitle ? (
            <>
              <h3 className="font-sans text-base font-semibold text-primary leading-snug">
                {goalTitle}
              </h3>
              <p className="font-sans text-sm text-muted-foreground leading-snug mt-0.5">
                {goal.goal_description}
              </p>
            </>
          ) : (
            <h3 className="font-sans text-base font-medium text-primary leading-snug">
              {goal.goal_description}
            </h3>
          )}
        </div>
        {isStrongest && (
          <TrendingUp className="shrink-0 h-4 w-4 text-sage-600 mt-0.5" aria-label="Strongest goal" />
        )}
        {isWeakest && (
          <TrendingDown className="shrink-0 h-4 w-4 text-coral-500 mt-0.5" aria-label="Needs work" />
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {/* Score Progression — only show chart when multiple data points */}
        {goal.score_progression.length > 1 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Score Progression
            </h4>
            <div className="bg-secondary rounded-md p-3">
              <ScoreProgressionChart scores={goal.score_progression} />
            </div>
          </div>
        )}

        {/* Knowledge Gap */}
        {goal.knowledge_gap && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gap Identified
            </h4>
            <div className="bg-secondary rounded-md p-3">
              <p className="text-sm text-foreground leading-relaxed">{goal.knowledge_gap}</p>
            </div>
          </div>
        )}

        {/* Competency results */}
        {goal.competency_results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Competencies
            </h4>
            <CompetencyResultsTable results={goal.competency_results} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
