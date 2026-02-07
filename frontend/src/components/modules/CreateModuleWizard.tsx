"use client";

import { useRef } from "react";
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

  // Reset draft store when dialog first opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !hasInitialized.current) {
      hasInitialized.current = true;
      reset();
      if (courseId) {
        setTargetCourseId(courseId);
      }
    }
    if (!nextOpen) {
      hasInitialized.current = false;
    }
    onOpenChange(nextOpen);
  };

  const handleSourceCreated = (sourceId: string) => {
    addPendingSource(sourceId);
  };

  const handleComplete = () => {
    router.push("/modules/new/review");
  };

  return (
    <AddSourceDialog
      open={open}
      onOpenChange={handleOpenChange}
      draftMode
      title="Add Sources"
      onSourceCreated={handleSourceCreated}
      onComplete={handleComplete}
    />
  );
}
