"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LinkIcon, FileIcon, FileTextIcon, LoaderIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import { useModuleDraftStore } from "@/lib/stores/module-draft-store";
import { useCreateSource } from "@/lib/hooks/use-sources";
import { useSettings } from "@/lib/hooks/use-settings";
import { useTransformations } from "@/lib/hooks/use-transformations";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadZone } from "@/components/ui/file-upload-zone";
import { parseAndValidateUrls } from "@/components/sources/steps/SourceTypeStep";
import { cn } from "@/lib/utils";

type Mode = "upload" | "link" | "text";

interface CreateModuleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: string;
  /** When true, skips draft reset and closes instead of navigating to the review page. */
  addMoreMode?: boolean;
}

export function CreateModuleWizard({
  open,
  onOpenChange,
  courseId,
  addMoreMode = false,
}: CreateModuleWizardProps) {
  const router = useRouter();
  const { addPendingSource, setTargetCourseId, reset } = useModuleDraftStore();
  const hasInitialized = useRef(false);

  const [mode, setMode] = useState<Mode>("upload");
  const [urlInput, setUrlInput] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createSource = useCreateSource();
  const { data: settings } = useSettings();
  const { data: transformations = [] } = useTransformations();

  const getDefaults = useCallback(() => {
    const embed =
      settings?.default_embedding_option === "always" ||
      settings?.default_embedding_option === "ask";
    const defaultTransformations = transformations
      .filter((t) => t.apply_default)
      .map((t) => t.id);
    return { embed, transformations: defaultTransformations };
  }, [settings, transformations]);

  useEffect(() => {
    if (open && !hasInitialized.current) {
      hasInitialized.current = true;
      if (!addMoreMode) {
        reset();
        if (courseId) setTargetCourseId(courseId);
      }
    }
    if (!open) {
      hasInitialized.current = false;
    }
  }, [open, courseId, reset, setTargetCourseId, addMoreMode]);

  const handleClose = () => {
    setMode("upload");
    setUrlInput("");
    setTextContent("");
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const navigateToReview = () => {
    handleClose();
    if (!addMoreMode) {
      router.push("/modules/new/review");
    }
  };

  const handleFilesChange = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    setIsSubmitting(true);
    const { embed, transformations: defaultTransformations } = getDefaults();

    try {
      for (const file of newFiles) {
        const result = await createSource.mutateAsync({
          type: "upload",
          modules: [],
          embed,
          transformations: defaultTransformations,
          async_processing: true,
          delete_source: false,
          file,
        } as Parameters<typeof createSource.mutateAsync>[0]);
        if (result?.id) addPendingSource(result.id);
      }
      navigateToReview();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Failed to upload files. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handleDone = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const { embed, transformations: defaultTransformations } = getDefaults();

    try {
      if (mode === "link") {
        const { valid, invalid } = parseAndValidateUrls(urlInput);
        if (invalid.length > 0) {
          toast.error(
            `${invalid.length} invalid URL(s) detected. Please fix them and try again.`
          );
          setIsSubmitting(false);
          return;
        }
        if (valid.length === 0) {
          toast.error("Please enter at least one valid URL.");
          setIsSubmitting(false);
          return;
        }
        for (const url of valid) {
          const result = await createSource.mutateAsync({
            type: "link",
            modules: [],
            url,
            embed,
            transformations: defaultTransformations,
            async_processing: true,
            delete_source: false,
          });
          if (result?.id) addPendingSource(result.id);
        }
      } else {
        if (!textContent.trim()) {
          toast.error("Please enter some content.");
          setIsSubmitting(false);
          return;
        }
        const result = await createSource.mutateAsync({
          type: "text",
          modules: [],
          content: textContent,
          embed,
          transformations: defaultTransformations,
          async_processing: true,
          delete_source: false,
        });
        if (result?.id) addPendingSource(result.id);
      }
      navigateToReview();
    } catch (error) {
      console.error("Error creating source:", error);
      toast.error("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  const showDoneButton =
    !isSubmitting &&
    ((mode === "link" && urlInput.trim().length > 0) ||
      (mode === "text" && textContent.trim().length > 0));

  const modeButtons: { value: Mode; label: string; Icon: typeof LinkIcon }[] = [
    { value: "link", label: "Add URL", Icon: LinkIcon },
    { value: "upload", label: "Upload File", Icon: FileIcon },
    { value: "text", label: "Enter Text", Icon: FileTextIcon },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/* Match CreateCourseDialog shell: rounded-xl, direct padding, custom top-left X */}
      <DialogContent
        className="max-w-[806px] rounded-xl px-16 pt-8 pb-16"
        showCloseButton={false}
      >
        {/* Custom top-left close button — matches CreateCourseDialog pattern */}
        <DialogClose className="absolute left-16 top-8 p-1 rounded-lg transition-colors hover:bg-secondary focus:outline-none focus-visible:bg-secondary">
          <X className="h-8 w-8" />
          <span className="sr-only">Close</span>
        </DialogClose>

        {/* Title centered */}
        <DialogTitle className="text-center">
          {addMoreMode ? "Add More Files" : "Create Module"}
        </DialogTitle>

        {/* Content area */}
        <div className="space-y-8">
          {/* All three content areas are always in the DOM at the same h-[200px] height.
              Only the active one is visible — prevents any layout shift on mode switch. */}
          <div className="relative h-[200px]">
            {/* Upload mode */}
            <div className={cn("absolute inset-0", mode !== "upload" && "hidden")}>
              {isSubmitting && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 rounded-lg">
                  <LoaderIcon className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              <FileUploadZone
                files={[]}
                onFilesChange={handleFilesChange}
                placeholder="Upload Your Files Here"
                disabled={isSubmitting}
                className="h-full"
              />
            </div>

            {/* Link mode */}
            <Textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={"Enter one or more URLs, one per line\nhttps://example.com\nhttps://another.com"}
              className={cn(
                "absolute inset-0 resize-none font-mono text-sm h-full",
                mode !== "link" && "hidden"
              )}
              disabled={isSubmitting}
            />

            {/* Text mode */}
            <Textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste or type your text content here..."
              className={cn(
                "absolute inset-0 resize-none h-full",
                mode !== "text" && "hidden"
              )}
              disabled={isSubmitting}
            />
          </div>

          {/* Pill buttons row — full width, each pill takes equal share */}
          <div className="flex items-center gap-3">
            {modeButtons.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                disabled={isSubmitting}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 h-12 px-8 rounded-md text-base font-medium tracking-[-0.01em] transition-colors disabled:pointer-events-none disabled:opacity-50",
                  value === mode
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-primary hover:bg-secondary"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {mode !== "upload" && (
              <motion.div
                key="done-button"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <Button
                  type="button"
                  variant={showDoneButton ? "accent" : "light"}
                  onClick={handleDone}
                  disabled={!showDoneButton || isSubmitting}
                  className="w-full"
                >
                  Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
