"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleInfoPanelProps {
  isGenerating: boolean;
  onRegenerateOverview: () => void;
}

export function ModuleInfoPanel({
  isGenerating,
  onRegenerateOverview,
}: ModuleInfoPanelProps) {
  const { name, overview, dueDate, prerequisites, setModuleField } =
    useModuleDraftStore();

  // Name is considered "generating" if isGenerating is true and name is empty
  const isNameGenerating = isGenerating && !name;

  return (
    <div className="w-[236px] flex-shrink-0 overflow-y-auto space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="draft-name"
            className="font-heading text-[24px] font-medium tracking-[-0.02em] text-teal-800"
          >
            Name
          </Label>
          {isNameGenerating && (
            <span className="flex items-center font-sans text-[14px] font-normal text-teal-800">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        <Input
          id="draft-name"
          value={name}
          onChange={(e) => setModuleField("name", e.target.value)}
          placeholder={isNameGenerating ? "Generating name..." : "Module name"}
          disabled={isNameGenerating}
          className={cn(isNameGenerating && "animate-border-pulse disabled:opacity-100")}
        />
      </div>

      {/* Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="draft-overview"
            className="font-heading text-[24px] font-medium tracking-[-0.02em] text-teal-800"
          >
            Overview
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerateOverview}
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
        <Textarea
          id="draft-overview"
          value={overview || ""}
          onChange={(e) => setModuleField("overview", e.target.value)}
          placeholder={
            isGenerating ? "Generating overview..." : "Enter module overview..."
          }
          disabled={isGenerating}
          className={cn(
            "min-h-[361px] max-h-[361px] resize-none",
            isGenerating && "animate-border-pulse disabled:opacity-100"
          )}
        />
      </div>

      {/* Due Date */}
      <div className="space-y-2">
        <Label
          htmlFor="draft-due-date"
          className="font-heading text-[24px] font-medium tracking-[-0.02em] text-teal-800"
        >
          Due Date
        </Label>
        <Input
          id="draft-due-date"
          type="date"
          value={dueDate || ""}
          onChange={(e) => setModuleField("dueDate", e.target.value || null)}
        />
      </div>

      {/* Prerequisites */}
      <div className="space-y-2">
        <Label
          htmlFor="draft-prerequisites"
          className="font-heading text-[24px] font-medium tracking-[-0.02em] text-teal-800"
        >
          Prerequisites
        </Label>
        <Input
          id="draft-prerequisites"
          value={prerequisites || ""}
          onChange={(e) =>
            setModuleField("prerequisites", e.target.value || null)
          }
          placeholder="e.g., CS 101, MATH 201"
        />
      </div>
    </div>
  );
}
