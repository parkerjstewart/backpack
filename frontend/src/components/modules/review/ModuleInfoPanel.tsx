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
    <div className="w-[236px] flex-shrink-0 space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="draft-name" className="font-heading text-lg">
            Name
          </Label>
          {isNameGenerating && (
            <span className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        <div className="relative">
          <Input
            id="draft-name"
            value={name}
            onChange={(e) => setModuleField("name", e.target.value)}
            placeholder={
              isNameGenerating ? "Generating name..." : "Module name"
            }
            disabled={isNameGenerating}
            className={cn(
              "border-2 border-[rgba(20,48,46,0.2)] focus:border-[#d4e297] focus:ring-0",
              isNameGenerating && "opacity-50"
            )}
          />
          {isNameGenerating && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="draft-overview" className="font-heading text-lg">
            Overview
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerateOverview}
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
        <div className="relative">
          <Textarea
            id="draft-overview"
            value={overview || ""}
            onChange={(e) => setModuleField("overview", e.target.value)}
            placeholder={
              isGenerating
                ? "Generating overview..."
                : "Enter module overview..."
            }
            disabled={isGenerating}
            className={cn(
              "min-h-[361px] border-2 border-[rgba(20,48,46,0.2)] focus:border-[#d4e297] focus:ring-0 resize-none",
              isGenerating && "opacity-50"
            )}
          />
          {isGenerating && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-md">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Due Date */}
      <div className="space-y-2">
        <Label htmlFor="draft-due-date" className="font-heading text-lg">
          Due Date
        </Label>
        <Input
          id="draft-due-date"
          type="date"
          value={dueDate || ""}
          onChange={(e) => setModuleField("dueDate", e.target.value || null)}
          className="border-2 border-[rgba(20,48,46,0.2)] focus:border-[#d4e297] focus:ring-0"
        />
      </div>

      {/* Prerequisites */}
      <div className="space-y-2">
        <Label htmlFor="draft-prerequisites" className="font-heading text-lg">
          Prerequisites
        </Label>
        <Input
          id="draft-prerequisites"
          value={prerequisites || ""}
          onChange={(e) =>
            setModuleField("prerequisites", e.target.value || null)
          }
          placeholder="e.g., CS 101, MATH 201"
          className="border-2 border-[rgba(20,48,46,0.2)] focus:border-[#d4e297] focus:ring-0"
        />
      </div>
    </div>
  );
}
