"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLeaveCourse } from "@/lib/hooks/use-courses";

interface LeaveCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
}

/**
 * LeaveCourseDialog - Confirmation dialog for a student dropping a course.
 *
 * Uses AlertDialog pattern (same as delete/archive in settings page).
 * Navigates back to /courses on success via useLeaveCourse hook.
 */
export function LeaveCourseDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
}: LeaveCourseDialogProps) {
  const leaveCourse = useLeaveCourse(courseId);

  const handleLeave = () => {
    leaveCourse.mutate(undefined, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Leave &ldquo;{courseTitle}&rdquo;?</AlertDialogTitle>

        <AlertDialogDescription>
          You will lose access to all course materials. You would need to
          request enrollment again to rejoin.
        </AlertDialogDescription>

        <div className="flex items-center justify-center gap-[15px]">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={leaveCourse.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={leaveCourse.isPending}
          >
            {leaveCourse.isPending ? "Leaving..." : "Leave Course"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
