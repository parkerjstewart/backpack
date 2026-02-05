"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/button";
import { useCreateSource } from "@/lib/hooks/use-sources";
import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import { cn } from "@/lib/utils";

interface AddFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesAdded?: () => void;
}

export function AddFilesDialog({
  open,
  onOpenChange,
  onFilesAdded,
}: AddFilesDialogProps) {
  const createSource = useCreateSource();
  const { addPendingSource } = useModuleDraftStore();

  const [isUploading, setIsUploading] = useState(false);
  const isUploadingRef = useRef(false);

  const closeDialog = () => {
    onOpenChange(false);
  };

  const uploadFiles = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0 || isUploadingRef.current) return;

    try {
      isUploadingRef.current = true;
      setIsUploading(true);

      // Create sources with modules: [] (unlinked until module is created)
      const uploadResults = await Promise.allSettled(
        selectedFiles.map((file) => {
          return createSource.mutateAsync({
            type: "upload" as const,
            modules: [], // No module association yet - will be linked on confirm
            embed: true,
            async_processing: true,
            file, // Include file directly in the object
          });
        })
      );

      // Add successfully created source IDs to draft store
      let addedCount = 0;
      uploadResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.id) {
          addPendingSource(result.value.id);
          addedCount++;
        }
      });

      // Notify parent that files were added
      if (addedCount > 0 && onFilesAdded) {
        onFilesAdded();
      }

      closeDialog();
    } catch (error) {
      console.error("Error uploading files:", error);
    } finally {
      isUploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      uploadFiles(Array.from(selectedFiles));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      uploadFiles(Array.from(droppedFiles));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={isUploading ? undefined : onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[600px] bg-background rounded-xl border-none p-0 gap-0 overflow-hidden"
      >
        {/* Visually hidden title for accessibility */}
        <DialogTitle className="sr-only">Add More Files</DialogTitle>

        <div className="relative flex flex-col gap-8 items-center pt-8 pb-16 px-16">
          {/* X close button - top left */}
          <IconButton
            onClick={closeDialog}
            disabled={isUploading}
            size="sm"
            className="absolute left-16 top-8"
            aria-label="Close"
          >
            <X className="text-foreground" />
          </IconButton>

          {/* Title - centered */}
          <h2 className="font-heading text-[32px] font-medium tracking-[-0.02em] text-primary">
            Add More Files
          </h2>

          {/* File upload area */}
          <div
            className={cn(
              "w-full bg-secondary border-2 border-dashed border-input rounded-lg transition-colors",
              isUploading
                ? "cursor-wait"
                : "cursor-pointer hover:border-teal-300"
            )}
            onDrop={isUploading ? undefined : handleDrop}
            onDragOver={isUploading ? undefined : handleDragOver}
          >
            <input
              id="add-files-input"
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
              accept=".pdf,.doc,.docx,.pptx,.ppt,.xlsx,.xls,.txt,.md,.epub,.mp4,.avi,.mov,.wmv,.mp3,.wav,.m4a,.aac,.jpg,.jpeg,.png,.tiff,.zip,.tar,.gz,.html"
            />
            <label
              htmlFor="add-files-input"
              className={cn(
                "block py-16 px-8",
                isUploading ? "cursor-wait" : "cursor-pointer"
              )}
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center">
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-teal-800 animate-spin" />
                  ) : (
                    <Upload className="h-6 w-6 text-teal-800" />
                  )}
                </div>
                <div className="flex flex-col gap-1 text-center">
                  <span className="font-sans text-[18px] font-normal tracking-[-0.01em] text-teal-800">
                    {isUploading
                      ? "Uploading..."
                      : "Drag and drop or click to upload"}
                  </span>
                  {!isUploading && (
                    <span className="font-sans text-[14px] font-normal text-teal-800">
                      *maximum 30Mb per file
                    </span>
                  )}
                </div>
              </div>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
