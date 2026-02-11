"use client";

import { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import { AddSourceDialog } from "@/components/sources/AddSourceDialog";

interface CreateModuleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: string;
}

export function CreateModuleWizard({
  open,
  onOpenChange,
  courseId,
}: CreateModuleWizardProps) {
  const router = useRouter();
  const { addPendingSource, setTargetCourseId, reset } = useModuleDraftStore();
  const hasInitialized = useRef(false);

  // Initialize draft store when dialog opens — useEffect instead of onOpenChange
  // because AddSourceDialog only calls onOpenChange(false) on close, never on open
  useEffect(() => {
    if (open && !hasInitialized.current) {
      hasInitialized.current = true;
      reset();
      if (courseId) {
        setTargetCourseId(courseId);
      }
    }
    if (!open) {
      hasInitialized.current = false;
    }
  }, [open, courseId, reset, setTargetCourseId]);

  const handleSourceCreated = (sourceId: string) => {
    addPendingSource(sourceId);
  };

  const handleComplete = () => {
    router.push("/modules/new/review");
  };

  return (
    <AddSourceDialog
      open={open}
      onOpenChange={onOpenChange}
      draftMode
      title="Add Sources"
      onSourceCreated={handleSourceCreated}
      onComplete={handleComplete}
    />
  );
}
