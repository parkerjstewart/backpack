"use client";

import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import { AddSourceDialog } from "@/components/sources/AddSourceDialog";

interface AddFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSourceCreated?: (sourceId: string) => void;
  onFilesAdded?: () => void;
}

export function AddFilesDialog({
  open,
  onOpenChange,
  onSourceCreated,
  onFilesAdded,
}: AddFilesDialogProps) {
  const { addPendingSource } = useModuleDraftStore();

  const handleSourceCreated = (sourceId: string) => {
    addPendingSource(sourceId);
    onSourceCreated?.(sourceId);
  };

  const handleComplete = () => {
    onFilesAdded?.();
  };

  return (
    <AddSourceDialog
      open={open}
      onOpenChange={onOpenChange}
      draftMode
      title="Add More Sources"
      onSourceCreated={handleSourceCreated}
      onComplete={handleComplete}
    />
  );
}
