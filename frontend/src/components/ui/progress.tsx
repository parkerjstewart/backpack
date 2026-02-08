"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  variant?: "default" | "success" | "warning"
}

function Progress({
  className,
  value,
  variant = "default",
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        // Height: 8px, border radius: 8px
        "relative h-2 w-full overflow-hidden rounded-sm",
        // Background: surface/elevated with border
        "bg-card border border-border",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 transition-all rounded-sm",
          // Variant colors
          variant === "default" && "bg-sage-300",
          variant === "success" && "bg-success",
          variant === "warning" && "bg-warning"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

// Full-width progress bar for footers
function ProgressFooter({
  className,
  value,
  variant = "default",
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress-footer"
      className={cn(
        // Full width, 8px height
        "relative h-2 w-full overflow-hidden",
        // No border radius for footer variant
        "bg-secondary",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 transition-all",
          variant === "default" && "bg-sage-300",
          variant === "success" && "bg-success",
          variant === "warning" && "bg-warning"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress, ProgressFooter }
