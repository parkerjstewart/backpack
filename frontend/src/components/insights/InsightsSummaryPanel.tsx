'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import type { GoalInsightResponse } from '@/lib/types/api'

interface InsightsSummaryPanelProps {
  goalInsights: GoalInsightResponse[]
  overallSummary: string | null
  strongestGoalId: string | null
  weakestGoalId: string | null
}

export function InsightsSummaryPanel({
  goalInsights,
  overallSummary,
  strongestGoalId,
  weakestGoalId,
}: InsightsSummaryPanelProps) {
  const overallScore =
    goalInsights.length > 0
      ? goalInsights.reduce((sum, g) => sum + g.final_score, 0) / goalInsights.length
      : 0

  const pct = Math.round(overallScore * 100)

  // SVG ring parameters
  const radius = 30
  const stroke = 5
  const cx = 40
  const cy = 40
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - overallScore)

  return (
    <div className="space-y-4">
      {/* Score ring + goal list */}
      <div className="flex items-start gap-4">
        {/* Circular score ring */}
        <div className="shrink-0">
          <svg width={80} height={80} viewBox="0 0 80 80" aria-label={`Overall score: ${pct}%`}>
            {/* Track */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={stroke}
            />
            {/* Progress arc */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={goalBadgeColor(overallScore)}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {/* Label */}
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={600}
              fill="currentColor"
            >
              {pct}%
            </text>
          </svg>
        </div>

        {/* Per-goal score list */}
        <div className="min-w-0 flex-1 space-y-1.5 pt-1">
          {goalInsights.map((goal) => {
            const isStrongest = goal.goal_id === strongestGoalId
            const isWeakest = goal.goal_id === weakestGoalId
            return (
              <div key={goal.goal_id} className="flex items-start gap-2">
                <span
                  className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5 w-10 text-center mt-0.5"
                  style={{ backgroundColor: goalBadgeColor(goal.final_score) }}
                >
                  {Math.round(goal.final_score * 100)}%
                </span>
                <span className="text-sm text-primary min-w-0 break-words flex-1">
                  {goal.goal_description}
                </span>
                {isStrongest && (
                  <TrendingUp className="shrink-0 h-3.5 w-3.5 text-sage-600" aria-label="Strongest" />
                )}
                {isWeakest && (
                  <TrendingDown className="shrink-0 h-3.5 w-3.5 text-coral-500" aria-label="Needs work" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary paragraph */}
      {overallSummary && (
        <p className="text-sm text-foreground leading-relaxed">{overallSummary}</p>
      )}
    </div>
  )
}
