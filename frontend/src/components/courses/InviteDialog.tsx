"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddCourseMember } from "@/lib/hooks/use-courses";

const inviteSchema = z.object({
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
    setValue,
    watch,
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      role: defaultRole,
    },
  });

  const role = watch("role");

  const closeDialog = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: InviteFormData) => {
    try {
      await addMember.mutateAsync({
        email: data.email,
        role: data.role,
      });
      closeDialog();
    } catch (error) {
      // Error handling is done in the mutation
      console.error("Error inviting member:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[480px] rounded-[24px] px-8 pt-6 pb-8"
        showCloseButton={false}
      >
        {/* Custom close button */}
        <DialogClose className="absolute right-6 top-6 p-1 rounded-lg transition-colors hover:bg-secondary focus:outline-none focus-visible:bg-secondary">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <DialogTitle className="text-center mb-6">
          Invite to Course
        </DialogTitle>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email field */}
          <div className="space-y-2">
            <FormLabel htmlFor="invite-email" required>
              Email Address
            </FormLabel>
            <Input
              id="invite-email"
              type="email"
              {...register("email")}
              placeholder="student@university.edu"
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Role field */}
          <div className="space-y-2">
            <FormLabel htmlFor="invite-role" required>
              Role
            </FormLabel>
            <Select
              value={role}
              onValueChange={(value: "student" | "instructor" | "ta") =>
                setValue("role", value)
              }
            >
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="ta">Teaching Assistant</SelectItem>
                <SelectItem value="instructor">Instructor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            variant={isValid ? "accent" : "light"}
            className="w-full"
            disabled={!isValid || addMember.isPending}
          >
            {addMember.isPending ? "Inviting..." : "Send Invite"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
