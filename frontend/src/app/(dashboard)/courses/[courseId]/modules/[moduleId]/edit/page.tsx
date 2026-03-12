"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, IconButton } from "@/components/ui/button";
import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import {
  useModule,
  useLearningGoals,
  useGenerateOverview,
  useGenerateLearningGoals,
} from "@/lib/hooks/use-modules";
import { useModuleSources } from "@/lib/hooks/use-sources";
import { modulesApi } from "@/lib/api/modules";
import { ModuleInfoPanel } from "@/components/modules/review/ModuleInfoPanel";
import { LearningGoalsPanel } from "@/components/modules/review/LearningGoalsPanel";
import { FilesSidebar } from "@/components/modules/review/FilesSidebar";
import { SourceDialog } from "@/components/source/SourceDialog";
import { RefinementChat } from "@/components/modules/RefinementChat";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { LearningGoalPreview } from "@/lib/types/api";

export default function EditModulePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";
  const moduleId = params?.moduleId
    ? decodeURIComponent(params.moduleId as string)
    : "";

  // API data
  const { data: module, isLoading: moduleLoading } = useModule(moduleId);
  const { data: existingGoals = [], isLoading: goalsLoading } =
    useLearningGoals(moduleId);
  const { sources, isLoading: sourcesLoading } = useModuleSources(moduleId);

  // Draft store
  const {
    name,
    overview,
    learningGoals: draftGoals,
    pendingSourceIds,
    setModuleField,
    setGeneratedContent,
    setDraftModuleId,
    addPendingSource,
    updateSourceStatus,
    reset,
  } = useModuleDraftStore();

  // Mutations
  const generateOverview = useGenerateOverview();
  const generateLearningGoals = useGenerateLearningGoals();

  // Local state
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [leftColumnHeight, setLeftColumnHeight] = useState<number | null>(null);
  const [refinePulse, setRefinePulse] = useState<{
    overview: boolean;
    goalIndices: Set<number>;
  }>({ overview: false, goalIndices: new Set() });
  const refinePulseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: populate draft store from API data
  useEffect(() => {
    if (!module || goalsLoading || sourcesLoading || initialized) return;

    reset();
    setDraftModuleId(moduleId);
    setModuleField("name", module.name);
    setModuleField("description", module.description || "");

    setGeneratedContent(
      module.overview || null,
      existingGoals.map((g, i) => ({
        description: g.description,
        title: g.title || "",
        takeaways: g.takeaways || "",
        competencies: g.competencies || "",
        order: i,
      }))
    );

    // Add sources as already-completed
    sources.forEach((source) => {
      addPendingSource(source.id);
      updateSourceStatus(source.id, "completed");
    });

    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, existingGoals, sources, goalsLoading, sourcesLoading]);

  // Reset draft store on unmount
  useEffect(() => {
    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Match goals column height to left column
  useEffect(() => {
    if (!initialized) {
      setLeftColumnHeight(null);
      return;
    }

    const el = leftColumnRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      setLeftColumnHeight((prev) => (prev === h ? prev : h));
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    window.addEventListener("resize", updateHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [initialized]);

  const handleRegenerateOverview = () => {
    generateOverview.mutate(
      { module_id: moduleId },
      {
        onSuccess: (data) => {
          setModuleField("overview", data.overview);
        },
      }
    );
  };

  const handleRegenerateLearningGoals = () => {
    generateLearningGoals.mutate(
      { module_id: moduleId },
      {
        onSuccess: (data) => {
          setGeneratedContent(
            overview,
            data.learning_goals.map((g, i) => ({
              description: g.description,
              title: g.title || "",
              takeaways: g.takeaways || "",
              competencies: g.competencies || "",
              order: i,
            }))
          );
        },
      }
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      // Update module name + overview
      await modulesApi.update(moduleId, {
        name: name.trim(),
        overview: overview || undefined,
      });

      // Replace all learning goals: delete existing, create from draft
      await Promise.allSettled(
        existingGoals.map((g) => modulesApi.deleteLearningGoal(g.id))
      );

      for (const goal of draftGoals) {
        await modulesApi.createLearningGoal(moduleId, {
          description: goal.description,
          title: goal.title || undefined,
          takeaways: goal.takeaways || undefined,
          competencies: goal.competencies || undefined,
          order: goal.order,
        });
      }

      toast.success("Module saved successfully");
      reset();
      router.push(
        `/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`
      );
    } catch (error) {
      console.error("Error saving module:", error);
      toast.error("Failed to save module. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefinementApply = (
    newOverview: string,
    newGoals: LearningGoalPreview[]
  ) => {
    const normalize = (s: string) => (s || "").trim().replace(/\s+/g, " ");
    const overviewChanged =
      normalize(newOverview) !== normalize(overview || "");
    const changedGoalIndices = new Set<number>();
    newGoals.forEach((g, i) => {
      const existing = draftGoals[i];
      if (
        !existing ||
        g.description !== existing.description ||
        (g.takeaways || "") !== (existing.takeaways || "") ||
        (g.competencies || "") !== (existing.competencies || "")
      ) {
        changedGoalIndices.add(i);
      }
    });

    setGeneratedContent(
      newOverview,
      newGoals.map((g, i) => ({
        description: g.description,
        title: g.title || "",
        takeaways: g.takeaways || "",
        competencies: g.competencies || "",
        order: i,
      }))
    );

    if (refinePulseTimeout.current) clearTimeout(refinePulseTimeout.current);
    setRefinePulse({ overview: overviewChanged, goalIndices: changedGoalIndices });
    refinePulseTimeout.current = setTimeout(
      () => setRefinePulse({ overview: false, goalIndices: new Set() }),
      1600
    );
  };

  // Build source statuses for FilesSidebar (all completed in edit mode)
  const sourceStatuses: Record<string, "processing" | "completed" | "failed"> =
    {};
  pendingSourceIds.forEach((id) => {
    sourceStatuses[id] = "completed";
  });

  const isGeneratingOverview = generateOverview.isPending;
  const isGeneratingGoals = generateLearningGoals.isPending;
  const canSave =
    name.trim().length > 0 &&
    !isSaving &&
    !isGeneratingOverview &&
    !isGeneratingGoals;

  if (moduleLoading || goalsLoading || sourcesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Module not found</h1>
          <Button asChild variant="outline">
            <Link href={`/courses/${encodeURIComponent(courseId)}`}>
              Back to course
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <IconButton size="sm" asChild>
            <Link
              href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`}
            >
              <X />
            </Link>
          </IconButton>
          <h1 className="font-heading text-[32px] font-medium tracking-[-0.02em] text-primary">
            Edit Module
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6">
        <div className="flex items-start gap-6">
          {/* Left: Module info */}
          <div ref={leftColumnRef}>
            <ModuleInfoPanel
              isGenerating={isGeneratingOverview}
              onRegenerateOverview={handleRegenerateOverview}
              isPulsingOverview={refinePulse.overview}
            />
          </div>

          {/* Center: Learning goals */}
          <div
            className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden"
            style={
              leftColumnHeight ? { height: `${leftColumnHeight}px` } : undefined
            }
          >
            <LearningGoalsPanel
              isGenerating={isGeneratingGoals}
              onRegenerateLearningGoals={handleRegenerateLearningGoals}
              pulsingGoalIndices={refinePulse.goalIndices}
            />
          </div>

          {/* Right: Files sidebar */}
          <FilesSidebar
            sourceIds={pendingSourceIds}
            sourceStatuses={sourceStatuses}
            onAddMore={() => {}}
            onSourceClick={(id) => setSelectedSourceId(id)}
          />
        </div>

        {/* Refinement Chat */}
        <div className="flex-shrink-0">
          <RefinementChat
            currentOverview={overview || ""}
            currentGoals={draftGoals.map((g) => ({
              description: g.description,
              takeaways: g.takeaways || "",
              competencies: g.competencies || "",
            }))}
            onApplyChanges={handleRefinementApply}
            moduleId={moduleId}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-4 border-t bg-background">
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" asChild>
            <Link
              href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`}
            >
              Cancel
            </Link>
          </Button>
          <Button variant="accent" onClick={handleSave} disabled={!canSave}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </footer>

      {/* Source detail dialog */}
      <SourceDialog
        open={selectedSourceId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSourceId(null);
        }}
        sourceId={selectedSourceId}
      />
    </div>
  );
}
