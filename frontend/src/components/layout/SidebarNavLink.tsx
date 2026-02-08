"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface SidebarNavLinkProps {
  href: string;
  children: React.ReactNode;
  /**
   * How to match the active state:
   * - "exact": pathname must equal href exactly
   * - "startsWith": pathname must start with href (for nested routes)
   */
  matchMode?: "exact" | "startsWith";
  /** Additional classes to apply */
  className?: string;
  /**
   * Visual variant:
   * - "course": Smaller text, sans-serif font (for course list items)
   * - "heading": Larger text, serif font, underlined (for section links like Archived/Settings)
   */
  variant?: "course" | "heading";
}

/**
 * Reusable sidebar navigation link with consistent hover and active states.
 *
 * Design system conventions:
 * - Hover: `bg-secondary` (neutral light color)
 * - Active/Selected: `bg-sidebar-accent` (sage green)
 *
 * @example
 * // Course item link
 * <SidebarNavLink href="/courses/123" matchMode="startsWith" variant="course">
 *   CS 111: Operating Systems
 * </SidebarNavLink>
 *
 * @example
 * // Section heading link
 * <SidebarNavLink href="/settings" variant="heading">
 *   Settings
 * </SidebarNavLink>
 */
export function SidebarNavLink({
  href,
  children,
  matchMode = "exact",
  className,
  variant = "course",
}: SidebarNavLinkProps) {
  const pathname = usePathname();

  const isActive =
    matchMode === "exact"
      ? pathname === href
      : pathname?.startsWith(href) || false;

  const baseStyles = "transition-all hover:bg-secondary hover:text-foreground";

  const variantStyles = {
    course: cn(
      "flex flex-col items-start w-full px-1 py-2 rounded-lg text-sm font-normal overflow-hidden",
      "text-teal-800",
      isActive && "bg-sidebar-accent text-foreground"
    ),
    heading: cn(
      "inline-block font-heading text-lg font-normal text-foreground underline underline-offset-4 decoration-1 tracking-tight px-2 py-0.5 rounded-lg",
      isActive && "bg-sidebar-accent"
    ),
  };

  return (
    <Link
      href={href}
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      {variant === "course" ? (
        <span className="truncate w-full">{children}</span>
      ) : (
        children
      )}
    </Link>
  );
}
