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
  return (
    <div className="space-y-5">
      {/* Goal header */}
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 mt-0.5 text-xs font-semibold rounded-full px-2.5 py-1"
          style={{ backgroundColor: goalBadgeColor(goal.final_score) }}
        >
          {Math.round(goal.final_score * 100)}%
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-xl font-medium text-primary leading-snug">
              {goal.goal_description}
            </h3>
            {isStrongest && (
              <span className="inline-flex items-center gap-1 text-xs text-sage-700 bg-sage-100 rounded-full px-2 py-0.5">
                <TrendingUp className="h-3 w-3" />
                Strongest
              </span>
            )}
            {isWeakest && (
              <span className="inline-flex items-center gap-1 text-xs text-coral-700 bg-coral-100 rounded-full px-2 py-0.5">
                <TrendingDown className="h-3 w-3" />
                Needs work
              </span>
            )}
          </div>
        </div>
        <ScoreProgressionChart scores={goal.score_progression} width={120} height={36} />
      </div>

      {/* Knowledge gap */}
      {goal.knowledge_gap && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Knowledge Gap
          </h4>
          <p className="text-sm text-foreground leading-relaxed">{goal.knowledge_gap}</p>
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

      {/* Stumbling concepts */}
      {goal.stumbling_concepts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stumbling Concepts
          </h4>
          <div className="flex flex-wrap gap-2">
            {goal.stumbling_concepts.map((concept, i) => (
              <span
                key={i}
                className="text-xs bg-amber-100 text-amber-800 rounded-full px-3 py-1"
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reinforcement topics */}
      {goal.reinforcement_topics.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Topics to Review
          </h4>
          <div className="flex flex-wrap gap-2">
            {goal.reinforcement_topics.map((topic, i) => (
              <span
                key={i}
                className="text-xs bg-sky-100 text-sky-800 rounded-full px-3 py-1"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tutor nudges */}
      {goal.tutor_nudges.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tutor Nudges Used
          </h4>
          <ul className="space-y-1">
            {goal.tutor_nudges.map((nudge, i) => (
              <li key={i} className="text-sm text-foreground flex gap-2">
                <span className="text-muted-foreground shrink-0">·</span>
                {nudge}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
