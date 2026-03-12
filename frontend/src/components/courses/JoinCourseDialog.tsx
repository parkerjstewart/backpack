"use client";

import { useEffect } from "react";
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
import { useRequestEnrollment } from "@/lib/hooks/use-courses";

const joinSchema = z.object({
  courseId: z.string().min(1, "Course ID is required"),
});

type JoinFormData = z.infer<typeof joinSchema>;

interface JoinCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * JoinCourseDialog - Dialog for students to request enrollment using a course ID.
 *
 * Students get the course ID from their instructor. Submitting sends an enrollment
 * request that the teaching team must approve before access is granted.
 */
export function JoinCourseDialog({ open, onOpenChange }: JoinCourseDialogProps) {
  const requestEnrollment = useRequestEnrollment();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    setError,
  } = useForm<JoinFormData>({
    resolver: zodResolver(joinSchema),
    mode: "onChange",
    defaultValues: { courseId: "" },
  });

  useEffect(() => {
    if (open) reset({ courseId: "" });
  }, [open, reset]);

  const closeDialog = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: JoinFormData) => {
    try {
      await requestEnrollment.mutateAsync(data.courseId.trim());
      closeDialog();
    } catch (error: unknown) {
      // Surface backend error message in the field
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Unable to send request. Check the course ID and try again.";
      setError("courseId", { message: detail });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[806px] rounded-[32px] px-16 pt-8 pb-16"
        showCloseButton={false}
      >
        <DialogClose className="absolute left-16 top-8 p-1 rounded-lg transition-colors hover:bg-secondary focus:outline-none focus-visible:bg-secondary">
          <X className="h-8 w-8" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogTitle className="text-center font-heading text-[32px] font-medium tracking-[-0.64px] text-primary">
          Join a Course
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 mt-6">
          <div className="flex flex-col gap-3">
            <FormLabel htmlFor="join-course-id" required>
              Course ID
            </FormLabel>
            <Input
              id="join-course-id"
              type="text"
              {...register("courseId")}
              placeholder="Paste the course ID from your instructor"
              autoComplete="off"
              autoFocus
            />
            {errors.courseId && (
              <p className="text-sm text-destructive">{errors.courseId.message}</p>
            )}
          </div>

          <Button
            type="submit"
            variant={isValid ? "accent" : "light"}
            className="w-full h-12"
            disabled={!isValid || requestEnrollment.isPending}
          >
            {requestEnrollment.isPending ? "Sending Request..." : "Request to Join"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
