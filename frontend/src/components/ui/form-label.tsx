"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

interface FormLabelProps
  extends React.ComponentProps<typeof LabelPrimitive.Root> {
  required?: boolean;
}

/**
 * FormLabel - Design system label for form fields
 *
 * Uses EB Garamond 24px (.text-title) matching Figma form label styles.
 * Supports `required` prop to show asterisk indicator.
 *
 * @example
 * <FormLabel required>Course Name</FormLabel>
 * <FormLabel>Description</FormLabel>
 */
function FormLabel({
  className,
  required,
  children,
  ...props
}: FormLabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="form-label"
      className={cn(
        // Typography: EB Garamond 24px from design system
        "text-title text-teal-800",
        // Layout
        "flex items-center gap-1",
        // States
        "select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-teal-800">*</span>}
    </LabelPrimitive.Root>
  );
}

export { FormLabel };
