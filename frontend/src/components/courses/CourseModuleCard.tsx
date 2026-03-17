"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLearningGoals, useDeleteModule } from "@/lib/hooks/use-modules";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { ModuleResponse } from "@/lib/types/api";

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

// Smooth HSL gradient: 100% = green, 75% = yellow-green, 50% = orange, 25%+ = red
function goalBadgeColor(score: number): string {
  const stops = [
    { pct: 0,   h: 0,   s: 72, l: 71 },
    { pct: 25,  h: 0,   s: 72, l: 71 },
    { pct: 50,  h: 30,  s: 90, l: 76 },
    { pct: 75,  h: 55,  s: 70, l: 74 },
    { pct: 100, h: 130, s: 60, l: 74 },
  ];

  const pct = Math.max(0, Math.min(100, score * 100));

  if (pct <= stops[0].pct) return `hsl(${stops[0].h}, ${stops[0].s}%, ${stops[0].l}%)`;
  const last = stops[stops.length - 1];
  if (pct >= last.pct) return `hsl(${last.h}, ${last.s}%, ${last.l}%)`;

  let lo = stops[0];
  let hi = stops[1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pct >= stops[i].pct && pct <= stops[i + 1].pct) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }

  const t = (pct - lo.pct) / (hi.pct - lo.pct);
  const h = Math.round(lo.h + t * (hi.h - lo.h));
  const s = Math.round(lo.s + t * (hi.s - lo.s));
  const l = Math.round(lo.l + t * (hi.l - lo.l));
  return `hsl(${h}, ${s}%, ${l}%)`;
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteModule = useDeleteModule();

  const visibleGoals = goals?.slice(0, 4) ?? [];
  const extraCount = (goals?.length ?? 0) - visibleGoals.length;

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteModule.mutate(module.id, { onSuccess: onDeleted });
  };

  return (
    <div className="relative group/card">
      <Link
        href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(module.id)}`}
        className="block border border-border rounded-lg px-6 py-4 bg-white hover:bg-secondary transition-colors"
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
              const score = goalScores?.[goal.id];
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
