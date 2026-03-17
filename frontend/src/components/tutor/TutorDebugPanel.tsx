'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Target, CheckCircle, Clock, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { TutorDebugInfo, CompetencyAssessment, CompetencyStatusInfo, CompetencyLifecycleStatus } from '@/lib/types/api'

interface TutorDebugPanelProps {
  debugInfo: TutorDebugInfo | null
  currentGoal: string | null
}

const ACTION_COLORS: Record<string, string> = {
  advance: 'bg-green-100 text-green-800 border-green-300',
  continue: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  probe: 'bg-blue-100 text-blue-800 border-blue-300',
  macro_hint: 'bg-red-100 text-red-800 border-red-300',
  explain_competency: 'bg-amber-100 text-amber-800 border-amber-300',
  tangent: 'bg-yellow-100 text-yellow-800 border-yellow-300',
}

const MODE_COLORS: Record<string, string> = {
  opening: 'bg-slate-100 text-slate-700 border-slate-300',
  guide: 'bg-blue-100 text-blue-800 border-blue-300',
  nudge: 'bg-orange-100 text-orange-800 border-orange-300',
  give_fact: 'bg-red-100 text-red-800 border-red-300',
  explain: 'bg-green-100 text-green-800 border-green-300',
  transition: 'bg-purple-100 text-purple-800 border-purple-300',
  tangent: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  // legacy names for backward compatibility
  open: 'bg-slate-100 text-slate-700 border-slate-300',
  socratic: 'bg-blue-100 text-blue-800 border-blue-300',
  macro_hint: 'bg-red-100 text-red-800 border-red-300',
  explain_competency: 'bg-green-100 text-green-800 border-green-300',
}

const LIFECYCLE_STYLES: Record<CompetencyLifecycleStatus, { badge: string; border: string; icon: React.ReactNode }> = {
  pending: {
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
    border: 'border-border bg-muted/20',
    icon: <Clock className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />,
  },
  active: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    border: 'border-blue-400 bg-blue-50/50',
    icon: <Target className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />,
  },
  mastered: {
    badge: 'bg-green-100 text-green-700 border-green-200',
    border: 'border-green-300 bg-green-50/30',
    icon: <CheckCircle className="h-3 w-3 text-success-fg mt-0.5 flex-shrink-0" />,
  },
  explained: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    border: 'border-amber-300 bg-amber-50/30',
    icon: <BookOpen className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />,
  },
}

const HYPOTHESIS_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  low: 'bg-gray-100 text-gray-600 border-gray-300',
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-green-500'
  if (score >= 0.5) return 'bg-amber-500'
  return 'bg-red-500'
}

function CompetencyCard({
  competency,
  score,
  evidence,
  gap,
  hypotheses,
  encounters,
  status,
}: {
  competency: string
  score: number
  evidence: string[]
  gap: string
  hypotheses: Array<{ text: string; confidence: string }>
  encounters: number
  status: CompetencyLifecycleStatus
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const scorePercent = Math.round(score * 100)
  const recentEvidence = evidence.slice(-3)
  const styles = LIFECYCLE_STYLES[status] ?? LIFECYCLE_STYLES.pending
  const isPending = status === 'pending'

  return (
    <div className={`rounded-md border p-3 space-y-2 text-xs ${styles.border}`}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          {styles.icon}
          <span className={`font-medium leading-snug ${status === 'active' ? 'text-blue-800' : ''} ${status === 'mastered' ? 'text-green-800' : ''}`}>
            {competency}
          </span>
        </div>
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0 ${styles.badge}`}>
          {status}
        </span>
      </div>

      {!isPending && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor(score)}`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <span className="text-muted-foreground w-8 text-right tabular-nums">
            {scorePercent}%
          </span>
        </div>
      )}

      {gap && !isPending && (
        <p className="text-muted-foreground italic leading-snug">{gap}</p>
      )}

      {hypotheses.length > 0 && !isPending && (
        <div className="flex flex-wrap gap-1">
          {hypotheses.map((h, i) => (
            <span
              key={i}
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                HYPOTHESIS_COLORS[h.confidence] ?? HYPOTHESIS_COLORS.low
              }`}
            >
              {h.confidence}: {h.text}
            </span>
          ))}
        </div>
      )}

      {recentEvidence.length > 0 && (
        <Collapsible open={evidenceOpen} onOpenChange={setEvidenceOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            {evidenceOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Evidence ({encounters} encounter{encounters !== 1 ? 's' : ''})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 space-y-1 pl-4">
              {recentEvidence.map((e, i) => (
                <li key={i} className="text-muted-foreground leading-snug list-disc">
                  {e}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function competencyCardsFromStatuses(statuses: CompetencyStatusInfo[]) {
  return statuses.map((s, i) => (
    <CompetencyCard
      key={i}
      competency={s.competency}
      score={s.score}
      evidence={s.evidence}
      gap={s.gap}
      hypotheses={s.hypotheses}
      encounters={s.encounters}
      status={s.status}
    />
  ))
}

function competencyCardsFromAssessments(assessments: CompetencyAssessment[], activeTarget: string | null) {
  return assessments.map((a, i) => (
    <CompetencyCard
      key={i}
      competency={a.competency}
      score={a.score}
      evidence={a.evidence}
      gap={a.gap}
      hypotheses={a.hypotheses}
      encounters={a.attempts}
      status={a.status ?? (a.competency === activeTarget ? 'active' : 'pending')}
    />
  ))
}

export function TutorDebugPanel({ debugInfo, currentGoal }: TutorDebugPanelProps) {
  if (!debugInfo) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2 flex-shrink-0">
          <CardTitle className="text-sm font-mono text-muted-foreground">Agent Debug</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center">
            Send a message to see agent state
          </p>
        </CardContent>
      </Card>
    )
  }

  const { tutor_mode, exchanges_on_goal, student_model, evaluation_notes, action_rationale, evaluator_guidance, competency_statuses, goal_score, competencies_mastered, competencies_total, evaluator_action } = debugInfo
  const modeClass = tutor_mode ? (MODE_COLORS[tutor_mode] ?? MODE_COLORS.open) : ''
  const activeTarget = student_model?.active_probe_target ?? null
  const confirmedKnowledge = student_model?.confirmed_knowledge ?? []
  const stagnation = student_model?.turns_since_last_progress ?? 0

  // Prefer new per-competency lifecycle data; fall back to student_model assessments
  const hasLifecycleData = competency_statuses && competency_statuses.length > 0
  const assessments = student_model?.competency_assessments ?? []

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0 border-b">
        <CardTitle className="text-sm font-mono text-muted-foreground">Agent Debug</CardTitle>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {tutor_mode && (
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${modeClass}`}
            >
              {tutor_mode}
            </span>
          )}
          {evaluator_action && (
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ACTION_COLORS[evaluator_action] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}
            >
              → {evaluator_action}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            exchange {exchanges_on_goal}
            {stagnation > 0 && ` · ${stagnation} turn${stagnation !== 1 ? 's' : ''} no progress`}
          </span>
        </div>
        {currentGoal && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
            {currentGoal}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
        {competencies_total != null && competencies_total > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Goal Progress
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${scoreColor(goal_score ?? 0)}`}
                  style={{ width: `${Math.round((goal_score ?? 0) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round((goal_score ?? 0) * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {competencies_mastered ?? 0}/{competencies_total} competencies mastered
            </p>
          </section>
        )}

        {(evaluation_notes || action_rationale || evaluator_guidance) && (
          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Evaluator
            </h3>
            {evaluator_guidance && (
              <p className="text-xs text-foreground font-medium leading-snug border-l-2 border-blue-400 pl-2">{evaluator_guidance}</p>
            )}
            {action_rationale && (
              <p className="text-xs text-foreground/80 italic leading-snug">{action_rationale}</p>
            )}
            {evaluation_notes && (
              <p className="text-xs text-muted-foreground leading-snug">{evaluation_notes}</p>
            )}
          </section>
        )}

        {(hasLifecycleData || assessments.length > 0) && (
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Competencies
            </h3>
            {hasLifecycleData
              ? competencyCardsFromStatuses(competency_statuses!)
              : competencyCardsFromAssessments(assessments, activeTarget)}
          </section>
        )}

        {confirmedKnowledge.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Confirmed knowledge
            </h3>
            <ul className="space-y-0.5 pl-3">
              {confirmedKnowledge.map((k, i) => (
                <li key={i} className="text-xs text-muted-foreground leading-snug list-disc">
                  {k}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
