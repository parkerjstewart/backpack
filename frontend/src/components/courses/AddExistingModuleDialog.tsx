"use client";

import { useState, useMemo } from "react";
import { Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useModules, useUpdateModule } from "@/lib/hooks/use-modules";
import { useCoursesStore } from "@/lib/stores/courses-store";
import { cn } from "@/lib/utils";

interface AddExistingModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
}

export function AddExistingModuleDialog({
  open,
  onOpenChange,
  courseId,
}: AddExistingModuleDialogProps) {
  const { data: modules } = useModules(false);
  const { moduleCourseMap, assignModuleToCourse } = useCoursesStore();
  const updateModule = useUpdateModule();

  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  // Get modules that are not assigned to any course
  const unassignedModules = useMemo(() => {
    return (modules ?? []).filter((m) => {
      // Check if module has no course_id from backend AND no mapping in store
      const hasBackendCourse = m.course_id && m.course_id !== courseId;
      const hasStoreCourse = moduleCourseMap[m.id] && moduleCourseMap[m.id] !== courseId;
      const isCurrentCourse = m.course_id === courseId || moduleCourseMap[m.id] === courseId;

      // Show modules that aren't assigned to any course (or already this course for re-adding)
      return !hasBackendCourse && !hasStoreCourse && !isCurrentCourse;
    });
  }, [modules, moduleCourseMap, courseId]);

  const toggleModule = (moduleId: string) => {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedModuleIds.size === 0) return;

    setIsAdding(true);
    try {
      // Update each selected module with the course_id
      await Promise.all(
        Array.from(selectedModuleIds).map(async (moduleId) => {
          await updateModule.mutateAsync({
            id: moduleId,
            data: { course_id: courseId },
          });
          // Also update the store for immediate UI feedback
          assignModuleToCourse(moduleId, courseId);
        })
      );

      // Close dialog and reset selection
      setSelectedModuleIds(new Set());
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding modules to course:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    setSelectedModuleIds(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Existing Modules</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {unassignedModules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All modules are already assigned to courses.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
              {unassignedModules.map((module) => {
                const isSelected = selectedModuleIds.has(module.id);
                return (
                  <button
                    key={module.id}
                    onClick={() => toggleModule(module.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                      isSelected
                        ? "border-teal-800 bg-secondary"
                        : "border-border hover:bg-secondary/50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                        isSelected
                          ? "border-teal-800 bg-teal-800"
                          : "border-muted-foreground"
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{module.name}</p>
                      {module.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {module.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedModuleIds.size === 0 || isAdding}
          >
            {isAdding
              ? "Adding..."
              : `Add ${selectedModuleIds.size > 0 ? `(${selectedModuleIds.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
