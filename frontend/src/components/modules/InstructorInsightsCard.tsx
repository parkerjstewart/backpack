"use client";

import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { goalBadgeColor } from "@/lib/utils/score-colors";
import type {
  ClassInsightsResponse,
  LearningGoalResponse,
  StudentProgressWithUser,
} from "@/lib/types/api";

interface InstructorInsightsCardProps {
  data: ClassInsightsResponse;
  courseId: string;
  moduleId: string;
  learningGoals?: LearningGoalResponse[];
}

function getStudentScore(sp: StudentProgressWithUser): number {
  const goals = sp.latest.goal_insights;
  if (goals.length === 0) return 0;
  return goals.reduce((sum, g) => sum + g.final_score, 0) / goals.length;
}

function getStudentIdPart(sp: StudentProgressWithUser): string {
  return sp.user.id.includes(":") ? sp.user.id.split(":")[1] : sp.user.id;
}

export function InstructorInsightsCard({
  data,
  courseId,
  moduleId,
  learningGoals = [],
}: InstructorInsightsCardProps) {
  const { stats, summary_text, student_count, student_progress, generated_at } =
    data;
  const avgPct = Math.round((stats.avg_overall_score ?? 0) * 100);
  const avgScore = stats.avg_overall_score ?? 0;
  const tiers = stats.performance_tiers ?? {
    mastered: 0,
    progressing: 0,
    struggling: 0,
  };
  const goalAverages = stats.goal_averages ?? [];
  const goalTitleMap = Object.fromEntries(learningGoals.map((g) => [g.id, g.title]));

  // Top 3 and bottom 3 students by score (or all if ≤6)
  const sorted = [...student_progress].sort(
    (a, b) => getStudentScore(b) - getStudentScore(a),
  );
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();
  const hasGap = sorted.length > 6;

  return (
    <Card className="border-border overflow-hidden p-6 gap-4">
      {/* 1. Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-card-title text-primary">Class Insights</h2>
            <Badge variant="secondary" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              {student_count} student{student_count !== 1 ? "s" : ""}
            </Badge>
          </div>
          {generated_at && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date(generated_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </div>

      {/* 2. Class Average — circular score ring + summary on same row */}
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <svg
            width={120}
            height={120}
            viewBox="0 0 80 80"
            aria-label={`Class average: ${avgPct}%`}
          >
            <circle
              cx={40}
              cy={40}
              r={30}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={5}
            />
            <circle
              cx={40}
              cy={40}
              r={30}
              fill="none"
              stroke={goalBadgeColor(avgScore)}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 30}
              strokeDashoffset={2 * Math.PI * 30 * (1 - avgScore)}
              transform="rotate(-90 40 40)"
            />
            <text
              x={40}
              y={40}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={600}
              fill="currentColor"
            >
              {avgPct}%
            </text>
          </svg>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              Class Avg
            </span>
            {tiers.mastered > 0 && (
              <span className="text-xs bg-sage-300/50 text-sage-700 rounded-full px-2.5 py-0.5">
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
          {summary_text && (
            <p className="text-sm text-foreground leading-snug">
              {summary_text}
            </p>
          )}
        </div>
      </div>

      {/* 3. Goal Averages — carousel of percent pills */}
      {goalAverages.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            Goal averages
          </span>
          <div className="flex overflow-x-auto gap-2 pb-1">
            {goalAverages.map((ga) => {
              const pct = Math.round((ga.avg_score ?? 0) * 100);
              return (
                <Tooltip key={ga.goal_id}>
                  <TooltipTrigger asChild>
                    <span
                      className="shrink-0 inline-block rounded-lg px-2.5 py-1.5 text-body-sm text-primary cursor-default whitespace-nowrap"
                      style={{ backgroundColor: goalBadgeColor(ga.avg_score) }}
                    >
                      {goalTitleMap[ga.goal_id] ? `${goalTitleMap[ga.goal_id]} · ${pct}%` : `${pct}%`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {ga.goal_description || goalTitleMap[ga.goal_id]}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Student Progress — top 3 and bottom 3 (or all if ≤6) */}
      {sorted.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            Students
          </span>
          <div className="space-y-0.5">
            {(hasGap ? top3 : sorted).map((sp) => {
              const avg = getStudentScore(sp);
              const pct = Math.round(avg * 100);
              const studentIdPart = getStudentIdPart(sp);
              const label = sp.user.name || sp.user.email;
              return (
                <Link
                  key={sp.user.id}
                  href={`/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentIdPart)}/modules/${encodeURIComponent(moduleId)}/insights`}
                  className="flex items-center gap-3 rounded-md px-3 py-1.5 hover:bg-secondary/50 transition-colors group"
                >
                  <span className="flex-1 text-sm text-primary truncate">
                    {label}
                  </span>
                  <div className="flex-1 min-w-0 max-w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: goalBadgeColor(avg),
                      }}
                    />
                  </div>
                  <span
                    className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5 w-10 text-center"
                    style={{ backgroundColor: goalBadgeColor(avg) }}
                  >
                    {pct}%
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </Link>
              );
            })}
            {hasGap && (
              <>
                <div className="flex justify-center py-0.5">
                  <span className="text-xs text-muted-foreground">…</span>
                </div>
                {bottom3.map((sp) => {
                  const avg = getStudentScore(sp);
                  const pct = Math.round(avg * 100);
                  const studentIdPart = getStudentIdPart(sp);
                  const label = sp.user.name || sp.user.email;
                  return (
                    <Link
                      key={sp.user.id}
                      href={`/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentIdPart)}/modules/${encodeURIComponent(moduleId)}/insights`}
                      className="flex items-center gap-3 rounded-md px-3 py-1.5 hover:bg-secondary/50 transition-colors group"
                    >
                      <span className="flex-1 text-sm text-primary truncate">
                        {label}
                      </span>
                      <div className="flex-1 min-w-0 max-w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: goalBadgeColor(avg),
                          }}
                        />
                      </div>
                      <span
                        className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5 w-10 text-center"
                        style={{ backgroundColor: goalBadgeColor(avg) }}
                      >
                        {pct}%
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
