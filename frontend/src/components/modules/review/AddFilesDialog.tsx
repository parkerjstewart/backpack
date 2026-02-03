"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, X } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
        className="sm:max-w-[600px] bg-[#fefcf6] rounded-[32px] border-none p-0 gap-0 overflow-hidden"
      >
        {/* Visually hidden title for accessibility */}
        <DialogTitle className="sr-only">Add More Files</DialogTitle>

        <div className="relative flex flex-col gap-8 items-center pt-8 pb-16 px-16">
          {/* X close button - top left */}
          <button
            onClick={closeDialog}
            disabled={isUploading}
            className={cn(
              "absolute left-16 top-8 w-8 h-8 flex items-center justify-center rounded-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              isUploading
                ? "opacity-30 cursor-not-allowed"
                : "opacity-70 hover:opacity-100"
            )}
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[#14302e]" />
          </button>

          {/* Title - centered */}
          <h2 className="font-heading font-medium text-[32px] text-[#14302e] tracking-[-0.64px]">
            Add More Files
          </h2>

          {/* File upload area */}
          <div
            className={cn(
              "w-full bg-[#f0f1eb] border-2 border-dashed border-[rgba(20,48,46,0.2)] rounded-[24px] transition-colors",
              isUploading
                ? "cursor-wait"
                : "cursor-pointer hover:border-[rgba(20,48,46,0.4)]"
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
                    <Loader2 className="h-6 w-6 text-[rgba(20,48,46,0.8)] animate-spin" />
                  ) : (
                    <Upload className="h-6 w-6 text-[rgba(20,48,46,0.8)]" />
                  )}
                </div>
                <div className="flex flex-col gap-1 text-center text-[rgba(20,48,46,0.8)]">
                  <span className="text-lg tracking-[-0.18px]">
                    {isUploading
                      ? "Uploading..."
                      : "Drag and drop or click to upload"}
                  </span>
                  {!isUploading && (
                    <span className="text-sm">*maximum 30Mb per file</span>
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
