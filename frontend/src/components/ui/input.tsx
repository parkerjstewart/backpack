import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles
        "flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base transition-all outline-none md:text-sm",
        // Border and placeholder
        "border-input placeholder:text-muted-foreground",
        // File input styles
        "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        // Selection
        "selection:bg-sage-500 selection:text-foreground",
        // Focus state - 2px sage border
        "focus-visible:border-2 focus-visible:border-sage-500 focus-visible:ring-sage-500/30 focus-visible:ring-[3px]",
        // Active/filled state
        "data-[filled=true]:border-2 data-[filled=true]:border-sage-500",
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

export { Input }
