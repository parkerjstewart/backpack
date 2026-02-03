"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useModuleDraftStore,
  DraftLearningGoal,
} from "@/lib/stores/module-draft-store";
import {
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LearningGoalsPanelProps {
  isGenerating: boolean;
  onRegenerateLearningGoals: () => void;
}

interface ExpandableGoalProps {
  goal: DraftLearningGoal;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (description: string) => void;
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
  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-all",
        "border-[rgba(20,48,46,0.2)]",
        isExpanded && "border-[#d4e297]"
      )}
    >
      {/* Collapsed/Header view */}
      <div
        className={cn(
          "flex items-center gap-2 p-3 cursor-pointer hover:bg-secondary/50 transition-colors",
          isExpanded && "border-b border-[rgba(20,48,46,0.1)]"
        )}
        onClick={onToggle}
      >
        <button
          type="button"
          className="flex-shrink-0 p-0.5 hover:bg-secondary rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <span className="flex-1 text-sm font-medium truncate">
          {goal.description || `Goal ${index + 1}`}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 p-1 hover:bg-secondary rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-secondary/20">
          {/* Title input */}
          <div className="space-y-2">
            <Input
              value={goal.description}
              onChange={(e) => onUpdate(e.target.value)}
              placeholder="Goal title"
              className="border-2 border-[rgba(20,48,46,0.2)] focus:border-[#d4e297] focus:ring-0"
            />
          </div>

          {/* Takeaways section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              The Takeaways
            </h4>
            <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
              <li>Key concept or skill to be learned</li>
              <li>Understanding that will be gained</li>
            </ul>
          </div>

          {/* Competencies section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Competencies
            </h4>
            <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
              <li>Ability to apply learned concepts</li>
              <li>Skill demonstration criteria</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function LearningGoalsPanel({
  isGenerating,
  onRegenerateLearningGoals,
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
    // Auto-expand the newly added goal
    setExpandedIndex(learningGoals.length);
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Label className="font-heading text-lg">Learning Goals</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRegenerateLearningGoals}
          disabled={isGenerating}
          className="h-7 px-2 text-xs"
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

      {/* Goals list */}
      <div className="space-y-3">
        {/* Add new goal button */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={isGenerating}
          className={cn(
            "w-full p-3 rounded-lg transition-colors",
            "border-2 border-dashed border-[rgba(20,48,46,0.3)]",
            "hover:border-[rgba(20,48,46,0.5)] hover:bg-secondary/30",
            "flex items-center justify-center gap-2",
            "text-sm text-muted-foreground",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Plus className="h-4 w-4" />
          Add new goal
        </button>

        {/* Loading state */}
        {isGenerating && learningGoals.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Generating learning goals...
          </div>
        )}

        {/* Goal cards */}
        {learningGoals.map((goal, index) => (
          <div key={`goal-${index}`} className="group">
            <ExpandableGoal
              goal={goal}
              index={index}
              isExpanded={expandedIndex === index}
              onToggle={() => handleToggle(index)}
              onUpdate={(description) => updateLearningGoal(index, description)}
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
          <p className="text-sm text-muted-foreground text-center py-4">
            No learning goals yet. Add a goal or wait for auto-generation.
          </p>
        )}
      </div>
    </div>
  );
}
