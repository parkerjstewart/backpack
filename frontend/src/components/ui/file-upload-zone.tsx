"use client";

import * as React from "react";
import { Upload, FileIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploadZoneProps {
  /** Currently selected files */
  files: File[];
  /** Callback when files change */
  onFilesChange: (files: File[]) => void;
  /** Accepted file types (e.g., ".pdf,.doc,.docx") */
  accept?: string;
  /** Max file size in bytes (default: 30MB) */
  maxSize?: number;
  /** Placeholder text for empty state */
  placeholder?: string;
  /** Allow multiple files (default: true) */
  multiple?: boolean;
  /** Additional class names */
  className?: string;
  /** ID for the hidden file input */
  inputId?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * FileUploadZone - Reusable file upload component with drag-and-drop support
 *
 * Two visual states:
 * - Empty: Dashed border, upload icon, placeholder text
 * - Uploaded: Solid border, file list with remove buttons
 *
 * @example
 * <FileUploadZone
 *   files={files}
 *   onFilesChange={setFiles}
 *   accept=".pdf,.doc,.docx"
 *   placeholder="Upload Your Syllabus Here"
 * />
 */
function FileUploadZone({
  files,
  onFilesChange,
  accept = ".pdf,.doc,.docx,.pptx,.ppt,.xlsx,.xls,.txt,.md,.epub,.mp4,.avi,.mov,.wmv,.mp3,.wav,.m4a,.aac,.jpg,.jpeg,.png,.tiff,.zip,.tar,.gz,.html",
  maxSize = 30 * 1024 * 1024, // 30MB
  placeholder = "Upload or drop your files",
  multiple = true,
  className,
  inputId,
  disabled = false,
}: FileUploadZoneProps) {
  const id = inputId || React.useId();
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const validFiles = Array.from(selectedFiles).filter(
        (file) => file.size <= maxSize
      );
      if (multiple) {
        onFilesChange([...files, ...validFiles]);
      } else {
        onFilesChange(validFiles.slice(0, 1));
      }
    }
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const validFiles = Array.from(droppedFiles).filter(
        (file) => file.size <= maxSize
      );
      if (multiple) {
        onFilesChange([...files, ...validFiles]);
      } else {
        onFilesChange(validFiles.slice(0, 1));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const hasFiles = files.length > 0;

  return (
    <div data-slot="file-upload-zone" className={cn("space-y-3", className)}>
      {/* Drop zone */}
      <div
        className={cn(
          "relative rounded-lg p-6 transition-all",
          // Empty state: dashed border
          !hasFiles && "border-2 border-dashed border-input bg-secondary",
          // With files: solid border
          hasFiles && "border border-solid border-input bg-secondary",
          // Drag over state
          isDragOver && "border-sage-500 bg-sage-500/10",
          // Interactive states
          !disabled && "cursor-pointer hover:border-sage-500/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          id={id}
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={handleFileChange}
          accept={accept}
          disabled={disabled}
        />
        <label
          htmlFor={id}
          className={cn(
            "flex flex-col items-center justify-center gap-3",
            !disabled && "cursor-pointer"
          )}
        >
          <Upload
            className={cn(
              "h-8 w-8",
              hasFiles ? "text-sage-700" : "text-muted-foreground"
            )}
          />
          <div className="text-center">
            <span className="text-body text-teal-800">
              {hasFiles
                ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                : placeholder}
            </span>
            {!hasFiles && (
              <p className="text-body-sm text-muted-foreground mt-1">
                *maximum {Math.round(maxSize / 1024 / 1024)}Mb per file
              </p>
            )}
          </div>
        </label>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-input"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <FileIcon className="h-5 w-5 text-sage-700 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-body text-foreground truncate block">
                    {file.name}
                  </span>
                  <span className="text-body-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                disabled={disabled}
                className="h-8 w-8 flex-shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { FileUploadZone };
export type { FileUploadZoneProps };
