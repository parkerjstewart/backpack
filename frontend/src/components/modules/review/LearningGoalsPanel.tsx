"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useModuleDraftStore,
  DraftLearningGoal,
} from "@/lib/stores/module-draft-store";
import { Plus, X, ChevronDown, Sparkles, Loader2 } from "lucide-react";
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
  return (
    <div
      className={cn(
        "border rounded-[16px] overflow-hidden transition-all",
        "border-border",
        isExpanded && "bg-white"
      )}
    >
      {/* Collapsed/Header view */}
      <div
        className={cn(
          "flex items-center gap-2 p-4 cursor-pointer transition-colors",
          !isExpanded && "hover:bg-secondary/50"
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
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </button>

        {isExpanded ? (
          <Input
            value={goal.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Goal title"
            className="flex-1 h-10 px-2 py-2 text-[18px] md:text-[18px] font-medium tracking-[-0.01em] border border-border rounded-lg bg-white placeholder:italic placeholder:text-primary/40 placeholder:font-normal"
          />
        ) : (
          <span className="flex-1 font-sans text-[18px] font-medium tracking-[-0.01em] text-primary truncate">
            {goal.description || `Goal ${index + 1}`}
          </span>
        )}

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
        <div className="px-6 pb-8 space-y-4">
          {/* Takeaways section */}
          <div className="space-y-2">
            <h4 className="font-sans text-[14px] font-normal text-primary">
              THE TAKEAWAYS
            </h4>
            <Textarea
              value={goal.takeaways}
              onChange={(e) => onUpdate({ takeaways: e.target.value })}
              placeholder="Key concepts or skills to be learned..."
              className="bg-white border border-border rounded-lg px-4 py-2 min-h-[40px] text-[14px] md:text-[14px] font-normal tracking-[-0.01em] text-primary placeholder:italic placeholder:text-primary/40 resize-none"
            />
          </div>

          {/* Competencies section */}
          <div className="space-y-2">
            <h4 className="font-sans text-[14px] font-normal text-primary">
              COMPETENCIES
            </h4>
            <Textarea
              value={goal.competencies}
              onChange={(e) => onUpdate({ competencies: e.target.value })}
              placeholder="Abilities to apply learned concepts..."
              className="bg-white border border-border rounded-lg px-4 py-2 min-h-[40px] text-[14px] md:text-[14px] font-normal tracking-[-0.01em] text-primary placeholder:italic placeholder:text-primary/40 resize-none"
            />
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
    // Auto-expand the newly added goal (now at index 0)
    setExpandedIndex(0);
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Label className="font-heading text-[24px] font-medium tracking-[-0.02em] text-teal-800">
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

      {/* Goals list */}
      <div className="space-y-3">
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

        {/* Loading state */}
        {isGenerating && learningGoals.length === 0 && (
          <div className="border-2 rounded-[16px] p-8 animate-border-pulse">
            <div className="flex items-center justify-center font-sans text-[16px] font-normal tracking-[-0.01em] text-teal-800">
              <Loader2 className="h-5 w-5 mr-2 animate-spin text-sage-700" />
              Generating learning goals...
            </div>
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
