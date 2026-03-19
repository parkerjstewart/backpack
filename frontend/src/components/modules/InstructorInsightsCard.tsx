'use client'

import Link from 'next/link'
import { Users, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { goalBadgeColor } from '@/lib/utils/score-colors'
import { useRegenerateClassInsights } from '@/lib/hooks/use-student-progress'
import { cn } from '@/lib/utils'
import type { ClassInsightsResponse } from '@/lib/types/api'

interface InstructorInsightsCardProps {
  data: ClassInsightsResponse
  courseId: string
  moduleId: string
}

export function InstructorInsightsCard({
  data,
  courseId,
  moduleId,
}: InstructorInsightsCardProps) {
  const regenerate = useRegenerateClassInsights(moduleId)

  const { stats, summary_text, student_count, student_progress } = data
  const avgPct = Math.round((stats.avg_overall_score ?? 0) * 100)
  const avgScore = stats.avg_overall_score ?? 0
  const tiers = stats.performance_tiers ?? { mastered: 0, progressing: 0, struggling: 0 }

  return (
    <Card className="border-border overflow-hidden p-6 space-y-4">
      {/* Title row */}
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">
          Class Insights
        </h2>
        <Badge variant="secondary" className="text-xs gap-1">
          <Users className="h-3 w-3" />
          {student_count} student{student_count !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Overall class average score bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
          Class Avg
        </span>
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${avgPct}%`,
              backgroundColor: goalBadgeColor(avgScore),
            }}
          />
        </div>
        <span
          className="shrink-0 text-xs font-semibold rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: goalBadgeColor(avgScore) }}
        >
          {avgPct}%
        </span>
      </div>

      {/* Per-student score badges — link to individual insights page */}
      {student_progress.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {student_progress.map((sp) => {
            const goals = sp.latest.goal_insights
            const avg = goals.length > 0
              ? goals.reduce((sum, g) => sum + g.final_score, 0) / goals.length
              : 0
            const pct = Math.round(avg * 100)
            const studentIdPart = sp.user.id.includes(':')
              ? sp.user.id.split(':')[1]
              : sp.user.id
            const label = sp.user.name || sp.user.email

            return (
              <Link
                key={sp.user.id}
                href={`/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentIdPart)}/modules/${encodeURIComponent(moduleId)}/insights`}
                className="text-xs font-semibold rounded-full px-2.5 py-0.5 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: goalBadgeColor(avg) }}
              >
                {label}: {pct}%
              </Link>
            )
          })}
        </div>
      )}

      {/* Performance tier pills */}
      <div className="flex items-center gap-2">
        {tiers.mastered > 0 && (
          <span className="text-xs bg-sage-100 text-sage-700 rounded-full px-2.5 py-0.5">
            {tiers.mastered} mastered
          </span>
        )}
        {tiers.progressing > 0 && (
          <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2.5 py-0.5">
            {tiers.progressing} progressing
          </span>
        )}
        {tiers.struggling > 0 && (
          <span className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-0.5">
            {tiers.struggling} struggling
          </span>
        )}
      </div>

      {/* LLM summary paragraph */}
      {summary_text && (
        <p className="text-sm text-foreground leading-relaxed">
          {summary_text}
        </p>
      )}

      {/* Regenerate button */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={regenerate.isPending}
          onClick={() => regenerate.mutate()}
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5 mr-1.5',
              regenerate.isPending && 'animate-spin'
            )}
          />
          {regenerate.isPending ? 'Regenerating…' : 'Regenerate Summary'}
        </Button>
        {regenerate.isSuccess && (
          <span className="text-xs text-muted-foreground">
            Summary will refresh shortly
          </span>
        )}
      </div>
    </Card>
  )
}
