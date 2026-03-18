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
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary">
            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Competency</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Status</th>
            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Score</th>
          </tr>
        </thead>
        <tbody>
          {results.map((c, i) => {
            const statusMeta = STATUS_LABELS[c.status] ?? { label: c.status, className: 'bg-secondary text-muted-foreground' }
            const pct = Math.round(c.score * 100)
            return (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 text-primary">{c.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block text-xs rounded-full px-2 py-0.5 font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: goalBadgeColor(c.score),
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
