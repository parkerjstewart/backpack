"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { goalBadgeColor } from "@/lib/utils/score-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLearningGoals, useDeleteModule } from "@/lib/hooks/use-modules";
import { useClassInsights } from "@/lib/hooks/use-student-progress";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { ModuleResponse, StudentProgressWithUser } from "@/lib/types/api";

function getStudentScore(sp: StudentProgressWithUser): number {
  const goals = sp.latest.goal_insights;
  if (goals.length === 0) return 0;
  return goals.reduce((sum, g) => sum + g.final_score, 0) / goals.length;
}

function getStudentIdPart(sp: StudentProgressWithUser): string {
  return sp.user.id.includes(":") ? sp.user.id.split(":")[1] : sp.user.id;
}

interface ModuleStats {
  completed: number;
  total: number;
  struggling: number;
}

interface CourseModuleCardProps {
  module: ModuleResponse;
  courseId: string;
  stats: ModuleStats;
  variant: "expanded" | "collapsed";
  goalScores?: Record<string, number>; // goal_id -> 0-1 avg score across students
  canDelete?: boolean;
  onDeleted?: () => void;
  isTeacher?: boolean;
  showCompleted?: boolean;
}


function ProgressBar({
  completed,
  total,
  leftLabel,
  showCompleted = true,
}: {
  completed: number;
  total: number;
  leftLabel?: string;
  showCompleted?: boolean;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 mt-4">
      {leftLabel && (
        <span className="shrink-0 text-body-sm text-primary whitespace-nowrap">
          {leftLabel}
        </span>
      )}
      <div className="flex-1 h-2 rounded-full border border-border bg-background overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showCompleted && (
        <span className="shrink-0 text-body-sm text-primary whitespace-nowrap">
          {completed}/{total} Completed
        </span>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ExpandedCard({
  module,
  courseId,
  stats,
  goalScores,
  canDelete,
  onDeleted,
  isTeacher,
  showCompleted = true,
}: Omit<CourseModuleCardProps, "variant">) {
  const { data: goals } = useLearningGoals(module.id);
  const { data: classInsightsData } = useClassInsights(isTeacher ? module.id : undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteModule = useDeleteModule();

  const visibleGoals = goals?.slice(0, 4) ?? [];
  const extraCount = (goals?.length ?? 0) - visibleGoals.length;

  // Derive goal scores from class insights when not explicitly provided
  const resolvedGoalScores = useMemo(() => {
    if (goalScores && Object.keys(goalScores).length > 0) return goalScores;
    if (!classInsightsData?.stats?.goal_averages) return {};
    const map: Record<string, number> = {};
    for (const ga of classInsightsData.stats.goal_averages) {
      map[ga.goal_id] = ga.avg_score;
    }
    return map;
  }, [goalScores, classInsightsData]);

  // Bottom 3 students by score for quick links
  const bottom3Students = useMemo(() => {
    if (!classInsightsData?.student_progress?.length) return [];
    const sorted = [...classInsightsData.student_progress].sort(
      (a, b) => getStudentScore(a) - getStudentScore(b),
    );
    return sorted.slice(0, 3);
  }, [classInsightsData]);

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteModule.mutate(module.id, { onSuccess: onDeleted });
  };

  return (
    <div className="relative group/card border border-border rounded-lg bg-white overflow-hidden">
      <Link
        href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(module.id)}`}
        className="block px-6 py-4 hover:bg-secondary transition-colors"
      >
        {/* Title row: module name left, paused badge + source count right */}
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-title-sm text-primary">
            {module.name}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {isTeacher && module.status === "paused" && (
              <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5">
                Paused
              </span>
            )}
            <span className="text-body-sm text-primary">
              {module.source_count} {module.source_count === 1 ? "source" : "sources"}
            </span>
          </div>
        </div>

        {/* Learning goal badges — instructors only; students see goals after tutor + insights */}
        {isTeacher && visibleGoals.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {visibleGoals.map((goal) => {
              const score = resolvedGoalScores[goal.id];
              const label = goal.title || goal.description;
              const pctLabel = score !== undefined ? ` (${Math.round(score * 100)}%)` : "";
              const isTruncated = !goal.title;
              return (
                <Tooltip key={goal.id}>
                  <TooltipTrigger asChild>
                    <span
                      className="inline-block rounded-lg bg-muted px-2.5 py-1.5 text-body-sm text-primary cursor-default whitespace-nowrap"
                      style={score !== undefined ? { backgroundColor: goalBadgeColor(score) } : undefined}
                    >
                      {label}{pctLabel}
                    </span>
                  </TooltipTrigger>
                  {isTruncated && (
                    <TooltipContent>
                      <p className="max-w-xs">{goal.description}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
            {extraCount > 0 && (
              <span className="inline-block rounded-lg bg-muted px-2.5 py-1.5 text-body-sm text-primary">
                +{extraCount} more
              </span>
            )}
          </div>
        )}

        {/* Progress bar: created date left, bar center, X/Y Completed right */}
        <ProgressBar
          completed={stats.completed}
          total={stats.total}
          leftLabel={formatDate(module.created)}
          showCompleted={showCompleted}
        />
      </Link>

      {/* Bottom 3 students quick links — inside the card visually, outside <Link> to allow independent navigation */}
      {isTeacher && bottom3Students.length > 0 && (
        <div className="px-6 pb-3 border-t border-border">
          <div className="flex flex-col gap-0.5 pt-2">
            {bottom3Students.map((sp) => {
              const avg = getStudentScore(sp);
              const pct = Math.round(avg * 100);
              const studentIdPart = getStudentIdPart(sp);
              const label = sp.user.name || sp.user.email;
              return (
                <Link
                  key={sp.user.id}
                  href={`/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentIdPart)}/modules/${encodeURIComponent(module.id)}/insights`}
                  className="flex items-center gap-2 py-0.5 w-fit group/student"
                >
                  <span className="text-body-sm text-primary group-hover/student:underline">{label}</span>
                  <span
                    className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: goalBadgeColor(avg) }}
                  >
                    {pct}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {canDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteDialog(true); }}
          className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-md text-destructive hover:bg-destructive/10"
          aria-label="Delete module"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Module"
        description={`Are you sure you want to delete "${module.name}"? This action cannot be undone.`}
        confirmText="Delete Forever"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CollapsedCard({
  module,
  courseId,
  stats,
  canDelete,
  onDeleted,
  isTeacher,
  showCompleted = true,
}: Omit<CourseModuleCardProps, "variant" | "goalScores">) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteModule = useDeleteModule();

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteModule.mutate(module.id, { onSuccess: onDeleted });
  };

  return (
    <div className="relative group/card">
      <Link
        href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(module.id)}`}
        className="block border border-border rounded-lg px-6 py-4 hover:bg-secondary transition-colors"
      >
        {/* Title row: module name left, paused/struggling badge + source/goal counts right */}
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-title-sm text-primary">
            {module.name}
          </h3>
          <div className="flex items-center gap-3 shrink-0">
            {isTeacher && module.status === "paused" && (
              <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5">
                Paused
              </span>
            )}
            {stats.struggling > 0 && (
              <span className="text-xs font-medium text-destructive bg-destructive/10 rounded-md px-2 py-0.5">
                {stats.struggling} struggling
              </span>
            )}
            <span className="text-body-sm text-primary">
              {module.source_count} {module.source_count === 1 ? "source" : "sources"}
              {module.learning_goal_count > 0 && (
                <> · {module.learning_goal_count} {module.learning_goal_count === 1 ? "goal" : "goals"}</>
              )}
            </span>
          </div>
        </div>

        {/* Progress bar: created date left, bar center, X/Y Completed right */}
        <ProgressBar
          completed={stats.completed}
          total={stats.total}
          leftLabel={formatDate(module.created)}
          showCompleted={showCompleted}
        />
      </Link>

      {canDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDeleteDialog(true); }}
          className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-md text-destructive hover:bg-destructive/10"
          aria-label="Delete module"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Module"
        description={`Are you sure you want to delete "${module.name}"? This action cannot be undone.`}
        confirmText="Delete Forever"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

export function CourseModuleCard({
  module,
  courseId,
  stats,
  variant,
  goalScores,
  canDelete,
  onDeleted,
  isTeacher,
  showCompleted = true,
}: CourseModuleCardProps) {
  if (variant === "expanded") {
    return (
      <ExpandedCard module={module} courseId={courseId} stats={stats} goalScores={goalScores} canDelete={canDelete} onDeleted={onDeleted} isTeacher={isTeacher} showCompleted={showCompleted} />
    );
  }
  return <CollapsedCard module={module} courseId={courseId} stats={stats} canDelete={canDelete} onDeleted={onDeleted} isTeacher={isTeacher} showCompleted={showCompleted} />;
}
