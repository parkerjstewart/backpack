'use client'

import type { GoalInsightResponse } from '@/lib/types/api'

interface PracticeRecommendationsProps {
  goalInsights: GoalInsightResponse[]
}

export function PracticeRecommendations({ goalInsights }: PracticeRecommendationsProps) {
  // Aggregate reinforcement_topics and stumbling_concepts, deduplicating by lowercase value
  const seen = new Set<string>()
  const items: string[] = []

  for (const goal of goalInsights) {
    for (const topic of goal.reinforcement_topics ?? []) {
      const key = topic.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        items.push(topic)
      }
    }
  }
  for (const goal of goalInsights) {
    for (const concept of goal.stumbling_concepts ?? []) {
      const key = concept.toLowerCase().trim()
      if (!seen.has(key)) {
        seen.add(key)
        items.push(concept)
      }
    }
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Get more practice with
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
