'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import { ScoreProgressionChart } from './ScoreProgressionChart'
import { CompetencyResultsTable } from './CompetencyResultsTable'
import type { GoalInsightResponse } from '@/lib/types/api'

interface GoalInsightDetailProps {
  goal: GoalInsightResponse
  isStrongest?: boolean
  isWeakest?: boolean
}

export function GoalInsightDetail({ goal, isStrongest, isWeakest }: GoalInsightDetailProps) {
  const color = goalBadgeColor(goal.final_score)

  return (
    <div
      className="rounded-lg border border-border p-4 space-y-4"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {/* Header row: score badge + goal description + trend icon */}
      <div className="flex items-start gap-2">
        <span
          className="shrink-0 mt-0.5 text-xs font-semibold rounded-full px-2.5 py-1"
          style={{ backgroundColor: color }}
        >
          {Math.round(goal.final_score * 100)}%
        </span>
        <h3 className="flex-1 text-sm font-medium text-primary leading-snug">
          {goal.goal_description}
        </h3>
        {isStrongest && (
          <TrendingUp className="shrink-0 h-4 w-4 text-sage-600 mt-0.5" aria-label="Strongest goal" />
        )}
        {isWeakest && (
          <TrendingDown className="shrink-0 h-4 w-4 text-coral-500 mt-0.5" aria-label="Needs work" />
        )}
      </div>

      {/* Trajectory sparkline — fills full card width */}
      {goal.score_progression.length > 0 && (
        <ScoreProgressionChart scores={goal.score_progression} />
      )}

      {/* Gap identified */}
      {goal.knowledge_gap && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Gap identified
          </h4>
          <p className="text-xs text-foreground leading-relaxed">{goal.knowledge_gap}</p>
        </div>
      )}

      {/* Competency results */}
      {goal.competency_results.length > 0 && (
        <CompetencyResultsTable results={goal.competency_results} />
      )}
    </div>
  )
}
