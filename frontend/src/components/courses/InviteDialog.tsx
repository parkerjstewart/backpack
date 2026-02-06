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
import { useAddCourseMember } from "@/lib/hooks/use-courses";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(["student", "instructor", "ta"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  defaultRole?: "student" | "instructor" | "ta";
}

/**
 * InviteDialog - Dialog for inviting students/instructors by email.
 *
 * Creates user if they don't exist and adds them to the course.
 * Design matches Figma node 212:8895 "Invite People Modal".
 */
export function InviteDialog({
  open,
  onOpenChange,
  courseId,
  defaultRole = "student",
}: InviteDialogProps) {
  const addMember = useAddCourseMember(courseId);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      role: defaultRole,
    },
  });

  // Reset form with correct role when dialog opens
  useEffect(() => {
    if (open) {
      reset({
        name: "",
        email: "",
        role: defaultRole,
      });
    }
  }, [open, defaultRole, reset]);

  const closeDialog = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: InviteFormData) => {
    try {
      await addMember.mutateAsync({
        name: data.name,
        email: data.email,
        role: data.role,
      });
      closeDialog();
    } catch (error) {
      // Error handling is done in the mutation
      console.error("Error inviting member:", error);
    }
  };

  // Dynamic title based on role
  const getTitle = () => {
    switch (defaultRole) {
      case "instructor":
        return "Add Instructor";
      case "ta":
        return "Add Teaching Assistant";
      default:
        return "Add Student";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[806px] rounded-[32px] px-16 pt-8 pb-16"
        showCloseButton={false}
      >
        {/* Close button on the left (matches Figma) */}
        <DialogClose className="absolute left-16 top-8 p-1 rounded-lg transition-colors hover:bg-secondary focus:outline-none focus-visible:bg-secondary">
          <X className="h-8 w-8" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogTitle className="text-center font-heading text-[32px] font-medium tracking-[-0.64px] text-primary">
          {getTitle()}
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8 mt-8">
          {/* Name field */}
          <div className="flex flex-col gap-3">
            <FormLabel htmlFor="invite-name" required>
              First and Last Name
            </FormLabel>
            <Input
              id="invite-name"
              type="text"
              {...register("name")}
              placeholder="Name"
              autoComplete="name"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email field */}
          <div className="flex flex-col gap-3">
            <FormLabel htmlFor="invite-email" required>
              Email Address
            </FormLabel>
            <Input
              id="invite-email"
              type="email"
              {...register("email")}
              placeholder="Email"
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            variant={isValid ? "accent" : "light"}
            className="w-full h-12"
            disabled={!isValid || addMember.isPending}
          >
            {addMember.isPending ? "Sending..." : "Send Invite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
