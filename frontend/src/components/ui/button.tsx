import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive tracking-[-0.01em]",
  {
    variants: {
      variant: {
        // Primary dark button (teal background) - Figma: surface/inverse
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        // Dark variant (alias for default, explicit teal)
        dark: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        // Accent button (sage green background) - Figma: color/sage/500
        accent:
          "bg-accent text-accent-foreground shadow-xs hover:bg-sage-500/80",
        // Light button (secondary surface) - Figma: surface/secondary
        light:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-muted",
        // Outline button - Figma: 2px dashed border, border/strong, text/secondary
        // Hover: surface/secondary background (neutral, not sage accent)
        outline:
          "border-2 border-dashed border-teal-800 bg-transparent text-teal-800 hover:bg-secondary",
        // Destructive (hard red)
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
        // Coral (soft destructive) - Figma: #FF8181
        coral: "bg-[#FF8181] text-foreground shadow-xs hover:bg-[#FF8181]/80",
        // Secondary (same as light)
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-muted",
        // Ghost (transparent) - hover uses neutral secondary, not accent
        ghost: "hover:bg-secondary hover:text-foreground",
        // Link style
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Default 48px height with 16px border-radius, 32px horizontal padding
        default: "h-12 px-8 py-3 rounded-[16px]",
        // Small 36px height
        sm: "h-9 rounded-[16px] gap-1.5 px-4 has-[>svg]:px-3",
        // Large 48px (same as default)
        lg: "h-12 rounded-[16px] px-8 has-[>svg]:px-6",
        // Standard square icon button
        icon: "size-9 rounded-[16px]",
        // Circular icon button (36px total, 20px icon + padding)
        "icon-circle": "size-9 rounded-full p-2",
        // Full-width bar (48px height, for icon-only or icon+text in a wide strip)
        wide: "h-12 w-full rounded-[16px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// Icon button variant for circular buttons
const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        // Hover uses neutral secondary, not sage accent
        default: "hover:bg-secondary hover:text-foreground",
        ghost: "hover:bg-secondary hover:text-foreground",
        outline:
          "border border-border hover:bg-secondary hover:text-foreground",
      },
      size: {
        default: "size-9 [&_svg]:size-5", // 36px with 20px icon
        sm: "size-8 [&_svg]:size-4", // 32px with 16px icon
        lg: "size-10 [&_svg]:size-6", // 40px with 24px icon
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function IconButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="icon-button"
      className={cn(iconButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants, IconButton, iconButtonVariants };
