"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { FileUploadZone } from "@/components/ui/file-upload-zone";
import { useCoursesStore, type Course } from "@/lib/stores/courses-store";

const createCourseSchema = z.object({
  code: z.string().min(1, "Course code is required"),
  name: z.string().min(1, "Course name is required"),
});

type CreateCourseFormData = z.infer<typeof createCourseSchema>;

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (course: Course) => void;
}

/**
 * CreateCourseDialog - Modal for creating a new course
 *
 * Matches Figma node 199:1245 with:
 * - Centered dialog with custom close button (top-left)
 * - FormLabel components for field labels
 * - FileUploadZone for syllabus upload
 * - Accent button when valid, light when disabled
 *
 * @example
 * <CreateCourseDialog
 *   open={dialogOpen}
 *   onOpenChange={setDialogOpen}
 *   onCreated={(course) => router.push(`/courses/${course.id}`)}
 * />
 */
export function CreateCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCourseDialogProps) {
  const { createCourse } = useCoursesStore();
  const [files, setFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CreateCourseFormData>({
    resolver: zodResolver(createCourseSchema),
    mode: "onChange",
    defaultValues: {
      code: "",
      name: "",
    },
  });

  const closeDialog = () => {
    setFiles([]);
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: CreateCourseFormData) => {
    try {
      // Create the course with code as name and name as description
      const course = createCourse(data.code, data.name);

      // TODO: When backend is ready, upload syllabus files here
      // For now, we store the file name in the course if files were selected
      if (files.length > 0) {
        // Future: Upload to backend and store reference
        console.log(
          "Syllabus files to upload:",
          files.map((f) => f.name)
        );
      }

      if (onCreated) {
        onCreated(course);
      }
      closeDialog();
    } catch (error) {
      console.error("Error creating course:", error);
    }
  };

  useEffect(() => {
    if (!open) {
      reset();
      setFiles([]);
    }
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[806px] rounded-[32px] px-16 pt-8 pb-16"
        showCloseButton={false}
      >
        {/* Custom positioned close button (top-left per Figma) */}
        <DialogClose className="absolute left-16 top-8 p-1 rounded-lg transition-colors hover:bg-secondary focus:outline-none focus-visible:bg-secondary">
          <X className="h-8 w-8" />
          <span className="sr-only">Close</span>
        </DialogClose>

        {/* Title centered */}
        <DialogTitle className="text-center">Create Course</DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Course Code field */}
          <div className="space-y-3">
            <FormLabel htmlFor="course-code" required>
              Course Code
            </FormLabel>
            <Input
              id="course-code"
              {...register("code")}
              placeholder="e.g., CS 224N"
              autoComplete="off"
            />
            {errors.code && (
              <p className="text-sm text-destructive">{errors.code.message}</p>
            )}
          </div>

          {/* Course Name field */}
          <div className="space-y-3">
            <FormLabel htmlFor="course-name" required>
              Course Name
            </FormLabel>
            <Input
              id="course-name"
              {...register("name")}
              placeholder="e.g., Natural Language Processing"
              autoComplete="off"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Syllabus upload field */}
          <div className="space-y-3">
            <FormLabel>Syllabus (optional)</FormLabel>
            <FileUploadZone
              files={files}
              onFilesChange={setFiles}
              accept=".pdf,.doc,.docx"
              placeholder="Upload Your Syllabus Here"
              multiple={false}
            />
          </div>

          {/* Submit button - accent when valid, light when disabled */}
          <Button
            type="submit"
            variant={isValid ? "accent" : "light"}
            className="w-full"
            disabled={!isValid}
          >
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
