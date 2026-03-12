"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseHeader } from "@/components/courses";
import { useModule, useLearningGoals } from "@/lib/hooks/use-modules";
import { useCourse } from "@/lib/hooks/use-courses";
import { useModuleSources } from "@/lib/hooks/use-sources";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { SourceCard } from "@/components/sources/SourceCard";
import { useDeleteSource, useRetrySource } from "@/lib/hooks/use-sources";
import { getCoursePermissions } from "@/lib/permissions/course";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  Pencil,
  ChevronDown,
  BookOpen,
  MessageSquare,
} from "lucide-react";
import { StudyToolsPanel } from "@/components/modules/StudyToolsPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    <div className="border border-border rounded-md overflow-hidden">
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {goal.takeaways}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {goal.competencies && (
              <div>
                <p className="font-medium text-primary text-xs uppercase tracking-wide mb-1">
                  Competencies
                </p>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {goal.competencies}
                  </ReactMarkdown>
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
  moduleOverview?: string | null;
  moduleDescription?: string | null;
  learningGoals: LearningGoalResponse[];
  goalsLoading: boolean;
  sources: SourceListResponse[];
  sourcesLoading: boolean;
  canEdit: boolean;
  onRefetchSources: () => void;
}

function TeacherView({
  courseId,
  moduleId,
  moduleName,
  moduleOverview,
  moduleDescription,
  learningGoals,
  goalsLoading,
  sources,
  sourcesLoading,
  canEdit,
  onRefetchSources,
}: TeacherViewProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const { openModal } = useModalManager();
  const deleteSource = useDeleteSource();
  const retrySource = useRetrySource();

  const handleDeleteSource = async (sourceId: string) => {
    await deleteSource.mutateAsync(sourceId);
    onRefetchSources();
    setDeleteDialogOpen(false);
    setSourceToDelete(null);
  };

  const overviewContent = moduleOverview || moduleDescription;

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Module header */}
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-title text-teal-800">{moduleName}</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
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
        </div>
      </div>

      {/* Overview */}
      {overviewContent && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-title-sm text-teal-800">Overview</h3>
          </div>
          <div className="prose prose-sm max-w-none bg-secondary rounded-md p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {overviewContent}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* Learning Goals */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title-sm text-teal-800">Learning Goals</h3>
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

      {/* Sources */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title-sm text-teal-800">Sources</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onClick={() => openModal("source", source.id)}
                onDelete={
                  canEdit
                    ? (id) => {
                        setSourceToDelete(id);
                        setDeleteDialogOpen(true);
                      }
                    : undefined
                }
                onRetry={canEdit ? (id) => retrySource.mutate(id) : undefined}
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
    </div>
  );
}

// ─── Student Overview View ───────────────────────────────────────────────────

interface StudentViewProps {
  courseId: string;
  moduleId: string;
  moduleName: string;
  moduleOverview?: string | null;
  moduleDescription?: string | null;
  sources: SourceListResponse[];
  sourcesLoading: boolean;
}

function StudentView({
  courseId,
  moduleId,
  moduleName,
  moduleOverview,
  moduleDescription,
  sources,
  sourcesLoading,
}: StudentViewProps) {
  const { openModal } = useModalManager();
  const overviewContent = moduleOverview || moduleDescription;

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Module header + actions */}
      <div className="flex flex-col gap-4">
        <h2 className="text-title text-teal-800">{moduleName}</h2>

        {overviewContent && (
          <div className="prose prose-sm max-w-none bg-secondary rounded-md p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {overviewContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild>
            <Link href={`/modules/${encodeURIComponent(moduleId)}/review`}>
              <GraduationCap className="h-4 w-4" />
              Start Tutor
            </Link>
          </Button>
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

      {/* Sources */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title-sm text-teal-800">Sources</h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onClick={() => openModal("source", source.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Study Tools */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title-sm text-teal-800">Study Tools</h3>
        </div>
        <StudyToolsPanel moduleId={moduleId} moduleName={moduleName} />
      </section>
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

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: module, isLoading: moduleLoading } = useModule(moduleId);
  const { data: learningGoals = [], isLoading: goalsLoading } =
    useLearningGoals(moduleId);
  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
  } = useModuleSources(moduleId);

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
          <h1 className="text-title text-teal-800 mb-2">Module not found</h1>
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
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isStudent ? (
            <StudentView
              courseId={courseId}
              moduleId={moduleId}
              moduleName={module.name}
              moduleOverview={module.overview}
              moduleDescription={module.description}
              sources={sources}
              sourcesLoading={sourcesLoading}
            />
          ) : (
            <TeacherView
              courseId={courseId}
              moduleId={moduleId}
              moduleName={module.name}
              moduleOverview={module.overview}
              moduleDescription={module.description}
              learningGoals={learningGoals}
              goalsLoading={goalsLoading}
              sources={sources}
              sourcesLoading={sourcesLoading}
              canEdit={permissions.canEditModuleContent}
              onRefetchSources={refetchSources}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
