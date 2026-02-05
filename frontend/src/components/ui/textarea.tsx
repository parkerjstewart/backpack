import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Base styles (match Input)
        "flex min-h-16 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base transition-all outline-none md:text-sm",
        // Border and placeholder
        "border-input placeholder:text-muted-foreground",
        // Selection
        "selection:bg-sage-500 selection:text-foreground",
        // Focus state - 2px sage border (match Input)
        "focus-visible:border-2 focus-visible:border-sage-500 focus-visible:ring-sage-500/30 focus-visible:ring-[3px]",
        // Disabled
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Invalid state
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
