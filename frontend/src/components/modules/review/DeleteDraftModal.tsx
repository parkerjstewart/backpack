"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeleteDraftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteDraftModal({
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteDraftModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Figma: surface/primary bg, 32px radius, 64px padding, 32px gap */}
      <AlertDialogContent className="flex flex-col items-center gap-12 border-0 rounded-[32px] p-16 sm:max-w-[774px]">
        {/* Figma: EB Garamond 48px, line-height 52.8px, letter-spacing -0.96px, text/primary */}
        <AlertDialogTitle className="font-heading text-[48px] font-normal leading-[52.8px] tracking-[-0.96px] text-center text-foreground max-w-[646px]">
          This draft will not be saved.
          <br />
          Do you want to proceed?
        </AlertDialogTitle>

        {/* Figma: 15px gap between buttons, centered */}
        <div className="flex items-center justify-center gap-[15px]">
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button variant="coral" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
