"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MarkdownViewEdit } from "@/components/ui/markdown-view-edit";
import { CompetencyList, parseCompetencies } from "@/components/ui/competency-list";
import {
  useModuleDraftStore,
  DraftLearningGoal,
} from "@/lib/stores/module-draft-store";
import { Plus, X, ChevronDown, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LearningGoalsPanelProps {
  isGenerating: boolean;
  onRegenerateLearningGoals: () => void;
  pulsingGoalIndices?: Set<number>;
}

interface ExpandableGoalProps {
  goal: DraftLearningGoal;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Omit<DraftLearningGoal, "order">>) => void;
  onRemove: () => void;
}

function ExpandableGoal({
  goal,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: ExpandableGoalProps) {
  const competencyCount = parseCompetencies(goal.competencies || "").length;

  return (
    <div
      className={cn(
        "border rounded-md overflow-hidden transition-[background-color] duration-300",
        "border-border",
        isExpanded ? "bg-white" : "bg-transparent"
      )}
    >
      {/* Header — always visible */}
      <div
        className={cn(
          "flex items-start gap-2 p-3 cursor-pointer",
          !isExpanded && "hover:bg-secondary/50 transition-colors duration-200"
        )}
        onClick={onToggle}
      >
        <button
          type="button"
          className="flex-shrink-0 mt-2 p-0.5 hover:bg-secondary rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              isExpanded && "rotate-180"
            )}
          />
        </button>

        {/* Title / description */}
        <div className="flex-1 min-w-0">
          <Input
            value={goal.title || ""}
            onChange={(e) => onUpdate({ title: e.target.value })}
            onClick={(e) => isExpanded && e.stopPropagation()}
            readOnly={!isExpanded}
            tabIndex={isExpanded ? 0 : -1}
            placeholder={isExpanded ? "Short title (e.g. Logistic Regression)" : goal.description || `Goal ${index + 1}`}
            className={cn(
              "flex-1 w-full h-8 px-2 py-1 text-[18px] md:text-[18px] font-medium tracking-[-0.01em] transition-all duration-300",
              "placeholder:italic placeholder:text-primary/40 placeholder:font-normal",
              isExpanded
                ? "border border-border rounded-lg bg-white cursor-text"
                : "border-transparent bg-transparent rounded-lg cursor-pointer pointer-events-none select-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            )}
          />

          {/* Collapsed subtitle area — fades out when expanded */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              isExpanded ? "opacity-0 max-h-0" : "opacity-100 max-h-12 mt-0.5"
            )}
          >
            {goal.description && (
              <span className="block px-2 text-[13px] text-muted-foreground italic truncate leading-tight">
                {goal.description}
              </span>
            )}
            {competencyCount > 0 && (
              <div className="px-2 mt-1">
                <Badge
                  variant="secondary"
                  className="text-[11px] px-1.5 py-0 h-4 font-normal text-muted-foreground"
                >
                  {competencyCount} {competencyCount === 1 ? "competency" : "competencies"}
                </Badge>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 mt-1 p-1 hover:bg-secondary rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      {/* Expanded content — always rendered, animated via CSS grid trick */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-8 space-y-4">
            {/* Description */}
            <div className="space-y-1">
              <h4 className="font-sans text-[14px] font-normal text-primary">
                DESCRIPTION
              </h4>
              <Input
                value={goal.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Full description of this learning goal..."
                className="text-sm"
              />
            </div>

            {/* Takeaways section */}
            <div className="space-y-2">
              <h4 className="font-sans text-[14px] font-normal text-primary">
                THE TAKEAWAYS
              </h4>
              <MarkdownViewEdit
                value={goal.takeaways || ""}
                onChange={(val) => onUpdate({ takeaways: val })}
                placeholder="Key concepts or skills to be learned..."
                className="bg-white border border-border rounded-lg px-4 py-2 min-h-[80px] text-[14px] tracking-[-0.01em] text-primary"
              />
            </div>

            {/* Competencies section */}
            <div className="space-y-2">
              <h4 className="font-sans text-[14px] font-normal text-primary">
                COMPETENCIES
              </h4>
              <CompetencyList
                value={goal.competencies || ""}
                onChange={(val) => onUpdate({ competencies: val })}
                placeholder="Abilities to apply learned concepts..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LearningGoalsPanel({
  isGenerating,
  onRegenerateLearningGoals,
  pulsingGoalIndices = new Set(),
}: LearningGoalsPanelProps) {
  const {
    learningGoals,
    addLearningGoal,
    updateLearningGoal,
    removeLearningGoal,
  } = useModuleDraftStore();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleAdd = () => {
    addLearningGoal("New learning goal");
    // Auto-expand the newly added goal (now at index 0)
    setExpandedIndex(0);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <Label className="text-title text-teal-800">
          Learning Goals
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRegenerateLearningGoals}
          disabled={isGenerating}
          className="h-7 px-2 font-sans text-[14px] font-normal"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              Regenerate
            </>
          )}
        </Button>
      </div>

      {/* Goals list - scrollable (p-1 -m-1 to prevent border/ring clipping) */}
      <div
        className={cn(
          "flex-1 space-y-3 p-4 -m-1 border-2 rounded-md transition-all",
          isGenerating ? "animate-border-pulse" : "border-input"
        )}
      >
        {/* Add new goal button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={isGenerating}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          Add new goal
        </Button>

        {/* Loading state - empty */}
        {isGenerating && learningGoals.length === 0 && (
          <div className="flex items-center justify-center py-8 font-sans text-[16px] font-normal tracking-[-0.01em] text-teal-800">
            <Loader2 className="h-5 w-5 mr-2 animate-spin text-sage-700" />
            Generating learning goals...
          </div>
        )}

        {/* Goal cards */}
        {learningGoals.map((goal, index) => (
          <div key={`goal-${index}`} className={cn("group", pulsingGoalIndices.has(index) && "animate-border-pulse rounded-md")}>
            <ExpandableGoal
              goal={goal}
              index={index}
              isExpanded={expandedIndex === index}
              onToggle={() => handleToggle(index)}
              onUpdate={(updates) => updateLearningGoal(index, updates)}
              onRemove={() => {
                removeLearningGoal(index);
                if (expandedIndex === index) {
                  setExpandedIndex(null);
                } else if (expandedIndex !== null && expandedIndex > index) {
                  setExpandedIndex(expandedIndex - 1);
                }
              }}
            />
          </div>
        ))}

        {/* Empty state */}
        {!isGenerating && learningGoals.length === 0 && (
          <p className="font-sans text-[16px] font-normal tracking-[-0.01em] text-teal-800 text-center py-4">
            No learning goals yet. Add a goal or wait for auto-generation.
          </p>
        )}
      </div>
    </div>
  );
}
