'use client'

import { goalBadgeColor } from '@/lib/utils/score-colors'
import type { CompetencyResult } from '@/lib/types/api'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  mastered:  { label: 'Mastered',  className: 'bg-sage-100 text-sage-700' },
  explained: { label: 'Explained', className: 'bg-amber-100 text-amber-700' },
  active:    { label: 'Active',    className: 'bg-sky-100 text-sky-700' },
  pending:   { label: 'Pending',   className: 'bg-secondary text-muted-foreground' },
}

interface CompetencyResultsTableProps {
  results: CompetencyResult[]
}

export function CompetencyResultsTable({ results }: CompetencyResultsTableProps) {
  if (!results || results.length === 0) return null

  return (
    <ul className="space-y-3">
      {results.map((c, i) => {
        const statusMeta = STATUS_LABELS[c.status] ?? { label: c.status, className: 'bg-secondary text-muted-foreground' }
        const pct = Math.round(c.score * 100)
        return (
          <li key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-sm text-primary flex-1 min-w-0">{c.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
              <div className="flex items-center gap-2 w-24">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden min-w-[48px]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: goalBadgeColor(c.score),
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-7 text-right">{pct}%</span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
