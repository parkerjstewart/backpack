"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseHeader } from "@/components/courses";
import { useModule, useLearningGoals, useDeleteModule, usePublishModule, useUnpublishModule } from "@/lib/hooks/use-modules";
import { useCourse } from "@/lib/hooks/use-courses";
import { useModuleSources } from "@/lib/hooks/use-sources";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { SourceCard } from "@/components/sources/SourceCard";
import { useDeleteSource, useRetrySource } from "@/lib/hooks/use-sources";
import { sourcesApi } from "@/lib/api/sources";
import { getCoursePermissions } from "@/lib/permissions/course";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  Pencil,
  Trash2,
  ChevronDown,
  MessageSquare,
  Eye,
  EyeOff,
  PauseCircle,
  PlayCircle,
  ArrowLeft,
} from "lucide-react";
import { StudyToolsPanel } from "@/components/modules/StudyToolsPanel";
import { MathMarkdown } from "@/components/ui/math-markdown";
import { LearningGoalResponse, SourceListResponse } from "@/lib/types/api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useModalManager } from "@/lib/hooks/use-modal-manager";

// ─── Read-only learning goals ────────────────────────────────────────────────

interface ReadOnlyGoalProps {
  goal: LearningGoalResponse;
}

function ReadOnlyGoal({ goal }: ReadOnlyGoalProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-secondary transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
        <span className="flex-1 text-sm font-medium">
          {goal.title || goal.description}
        </span>
        {goal.description && goal.title && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">
            {goal.description}
          </span>
        )}
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-3 text-sm text-muted-foreground">
            {goal.description && goal.title && (
              <p className="italic">{goal.description}</p>
            )}
            {goal.takeaways && (
              <div>
                <p className="font-medium text-primary text-xs uppercase tracking-wide mb-1">
                  Takeaways
                </p>
                <div className="prose prose-sm max-w-none">
                  <MathMarkdown>{goal.takeaways}</MathMarkdown>
                </div>
              </div>
            )}
            {goal.competencies && (
              <div>
                <p className="font-medium text-primary text-xs uppercase tracking-wide mb-1">
                  Competencies
                </p>
                <div className="prose prose-sm max-w-none">
                  <MathMarkdown>{goal.competencies}</MathMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Teacher Overview View ──────────────────────────────────────────────────

interface TeacherViewProps {
  courseId: string;
  moduleId: string;
  moduleName: string;
  moduleStatus: 'draft' | 'published' | 'paused';
  moduleOverview?: string | null;
  moduleDescription?: string | null;
  learningGoals: LearningGoalResponse[];
  goalsLoading: boolean;
  sources: SourceListResponse[];
  sourcesLoading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onRefetchSources: () => void;
  onToggleStudentView: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  isPublishing: boolean;
  isUnpublishing: boolean;
}

function TeacherView({
  courseId,
  moduleId,
  moduleName,
  moduleStatus,
  moduleOverview,
  moduleDescription,
  learningGoals,
  goalsLoading,
  sources,
  sourcesLoading,
  canEdit,
  canDelete,
  onRefetchSources,
  onToggleStudentView,
  onPublish,
  onUnpublish,
  isPublishing,
  isUnpublishing,
}: TeacherViewProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteModuleDialogOpen, setDeleteModuleDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const { openModal } = useModalManager();
  const deleteSource = useDeleteSource();
  const deleteModule = useDeleteModule();
  const retrySource = useRetrySource();

  const handleDeleteSource = async (sourceId: string) => {
    await deleteSource.mutateAsync(sourceId);
    onRefetchSources();
    setDeleteDialogOpen(false);
    setSourceToDelete(null);
  };

  const handleRenameSource = async (sourceId: string, newTitle: string) => {
    try {
      await sourcesApi.update(sourceId, { title: newTitle });
      onRefetchSources();
    } catch (error) {
      console.error("Failed to rename source:", error);
    }
  };

  const overviewContent = moduleOverview || moduleDescription;

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Paused banner */}
      {moduleStatus === "paused" && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800">
            <PauseCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Module is paused</p>
              <p className="text-xs text-amber-700">Students cannot start tutoring sessions while this module is paused.</p>
            </div>
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={onPublish}
              disabled={isPublishing}
              className="flex-shrink-0"
            >
              <PlayCircle className="h-4 w-4" />
              {isPublishing ? "Publishing…" : "Publish"}
            </Button>
          )}
        </div>
      )}

      {/* Module actions */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/courses/${encodeURIComponent(courseId)}`}
          className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to modules
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && moduleStatus === "published" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onUnpublish}
              disabled={isUnpublishing}
            >
              <PauseCircle className="h-4 w-4" />
              {isUnpublishing ? "Pausing…" : "Pause"}
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" size="sm" asChild>
              <Link
                href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/edit`}
              >
                <Pencil className="h-4 w-4" />
                Edit Module
              </Link>
            </Button>
          )}
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/modules/${encodeURIComponent(moduleId)}/review`}>
              <GraduationCap className="h-4 w-4" />
              Test Tutor
            </Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={onToggleStudentView}>
            <Eye className="h-4 w-4" />
            Student View
          </Button>
          {canDelete && (
            <Button
              variant="secondary"
              size="sm"
              className="text-destructive hover:text-destructive/80"
              onClick={() => setDeleteModuleDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Module
            </Button>
          )}
        </div>
      </div>

      {/* Overview */}
      {overviewContent && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Overview</h2>
          <div className="prose prose-sm max-w-none bg-secondary rounded-md p-4">
            <MathMarkdown>{overviewContent}</MathMarkdown>
          </div>
        </section>
      )}

      {/* Two-column: Sources (1/4) + Learning Goals (3/4) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr] gap-8 items-start">
        {/* Sources column */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Sources</h2>
            <Badge variant="secondary" className="text-xs">
              {sources.length}
            </Badge>
          </div>
          {sourcesLoading ? (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No sources attached to this module.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onClick={() => openModal("source", source.id)}
                  className="bg-transparent"
                  onDelete={
                    canEdit
                      ? (id) => {
                          setSourceToDelete(id);
                          setDeleteDialogOpen(true);
                        }
                      : undefined
                  }
                  onRetry={canEdit ? (id) => retrySource.mutate(id) : undefined}
                  onRename={canEdit ? handleRenameSource : undefined}
                  showRemoveFromModule={canEdit}
                  editModuleHref={
                    canEdit
                      ? `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/edit`
                      : undefined
                  }
                  onRefresh={onRefetchSources}
                />
              ))}
            </div>
          )}
        </section>

        {/* Learning Goals column */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Learning Goals</h2>
            <Badge variant="secondary" className="text-xs">
              {learningGoals.length}
            </Badge>
          </div>
          {goalsLoading ? (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : learningGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No learning goals defined for this module.
            </p>
          ) : (
            <div className="space-y-2">
              {learningGoals.map((goal) => (
                <ReadOnlyGoal key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete source"
        description="Are you sure you want to permanently delete this source? This cannot be undone."
        onConfirm={() => sourceToDelete && handleDeleteSource(sourceToDelete)}
        isLoading={deleteSource.isPending}
        confirmText="Delete"
        confirmVariant="destructive"
      />

      <ConfirmDialog
        open={deleteModuleDialogOpen}
        onOpenChange={setDeleteModuleDialogOpen}
        title="Delete Module"
        description={`Are you sure you want to delete "${moduleName}"? This action cannot be undone.`}
        confirmText="Delete Forever"
        confirmVariant="destructive"
        onConfirm={() => {
          setDeleteModuleDialogOpen(false);
          deleteModule.mutate(moduleId, {
            onSuccess: () => router.push(`/courses/${encodeURIComponent(courseId)}`),
          });
        }}
      />
    </div>
  );
}

// ─── Student Overview View ───────────────────────────────────────────────────

interface StudentViewProps {
  courseId: string;
  moduleId: string;
  moduleName: string;
  moduleStatus: 'draft' | 'published' | 'paused';
  moduleOverview?: string | null;
  moduleDescription?: string | null;
  sources: SourceListResponse[];
  sourcesLoading: boolean;
}

function StudentView({
  courseId,
  moduleId,
  moduleName,
  moduleStatus,
  moduleOverview,
  moduleDescription,
  sources,
  sourcesLoading,
}: StudentViewProps) {
  const { openModal } = useModalManager();
  const overviewContent = moduleOverview || moduleDescription;
  const isPaused = moduleStatus === "paused";

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Actions row */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/courses/${encodeURIComponent(courseId)}`}
          className="inline-flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to modules
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPaused ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm text-muted-foreground">
              <PauseCircle className="h-4 w-4 flex-shrink-0" />
              This module is not currently available for tutoring.
            </div>
          ) : (
            <Button asChild>
              <Link href={`/modules/${encodeURIComponent(moduleId)}/review`}>
                <GraduationCap className="h-4 w-4" />
                Start Tutor
              </Link>
            </Button>
          )}
          <Button variant="secondary" asChild>
            <Link
              href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/chat`}
            >
              <MessageSquare className="h-4 w-4" />
              Chat with Sources
            </Link>
          </Button>
        </div>
      </div>

      {/* Overview */}
      {overviewContent && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Overview</h2>
          <div className="prose prose-sm max-w-none bg-secondary rounded-md p-4">
            <MathMarkdown>{overviewContent}</MathMarkdown>
          </div>
        </section>
      )}

      {/* Two-column: Sources (1/3) + Study Tools (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr] gap-8 items-start">
        {/* Sources column */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Sources</h2>
            <Badge variant="secondary" className="text-xs">
              {sources.length}
            </Badge>
          </div>
          {sourcesLoading ? (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No sources in this module yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onClick={() => openModal("source", source.id)}
                  className="bg-transparent"
                />
              ))}
            </div>
          )}
        </section>

        {/* Study Tools column */}
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-medium tracking-[-0.24px] text-primary">Study Tools</h2>
          <StudyToolsPanel moduleId={moduleId} moduleName={moduleName} />
        </section>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CourseModuleOverviewPage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";
  const moduleId = params?.moduleId
    ? decodeURIComponent(params.moduleId as string)
    : "";

  const [studentViewPreview, setStudentViewPreview] = useState(false);

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: module, isLoading: moduleLoading } = useModule(moduleId);
  const { data: learningGoals = [], isLoading: goalsLoading } =
    useLearningGoals(moduleId);
  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
  } = useModuleSources(moduleId);

  const publishModule = usePublishModule();
  const unpublishModule = useUnpublishModule();

  const permissions = getCoursePermissions(course?.membership_role);
  const isStudent = course?.membership_role === "student";

  if (moduleLoading || courseLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!module) {
    return (
      <AppShell>
        <div className="p-8">
          <h1 className="text-title text-primary mb-2">Module not found</h1>
          <p className="text-muted-foreground mb-4">
            This module could not be loaded. It may have been deleted or is
            unavailable.
          </p>
          <Button asChild>
            <Link href={`/courses/${encodeURIComponent(courseId)}`}>
              Back to course
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Course Header */}
        <div className="flex-shrink-0 px-8 pt-8">
          {course && (
            <CourseHeader
              courseId={courseId}
              courseName={course.title}
              membershipRole={course.membership_role}
              moduleName={module.name}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isStudent ? (
            <StudentView
              courseId={courseId}
              moduleId={moduleId}
              moduleName={module.name}
              moduleStatus={module.status}
              moduleOverview={module.overview}
              moduleDescription={module.description}
              sources={sources}
              sourcesLoading={sourcesLoading}
            />
          ) : studentViewPreview ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary px-4 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  Previewing as student
                </div>
                <button
                  type="button"
                  onClick={() => setStudentViewPreview(false)}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  <EyeOff className="h-4 w-4" />
                  Exit Student View
                </button>
              </div>
              <StudentView
                courseId={courseId}
                moduleId={moduleId}
                moduleName={module.name}
                moduleStatus={module.status}
                moduleOverview={module.overview}
                moduleDescription={module.description}
                sources={sources}
                sourcesLoading={sourcesLoading}
              />
            </div>
          ) : (
            <TeacherView
              courseId={courseId}
              moduleId={moduleId}
              moduleName={module.name}
              moduleStatus={module.status}
              moduleOverview={module.overview}
              moduleDescription={module.description}
              learningGoals={learningGoals}
              goalsLoading={goalsLoading}
              sources={sources}
              sourcesLoading={sourcesLoading}
              canEdit={permissions.canEditModuleContent}
              canDelete={permissions.canCreateModules}
              onRefetchSources={refetchSources}
              onToggleStudentView={() => setStudentViewPreview(true)}
              onPublish={() => publishModule.mutate(moduleId)}
              onUnpublish={() => unpublishModule.mutate(moduleId)}
              isPublishing={publishModule.isPending}
              isUnpublishing={unpublishModule.isPending}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
