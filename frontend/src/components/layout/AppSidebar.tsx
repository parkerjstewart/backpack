"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebarStore } from "@/lib/stores/sidebar-store";
import { useCreateDialogs } from "@/lib/hooks/use-create-dialogs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { TranslationKeys } from "@/lib/locales";
import { useTranslation } from "@/lib/hooks/use-translation";
import {
  Book,
  Search,
  Shuffle,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  FileText,
  Plus,
  Wrench,
  Command,
} from "lucide-react";

// Brand name for the sidebar - using serif font (EB Garamond)
const BRAND_NAME = "Margin";

const getNavigation = (t: TranslationKeys) =>
  [
    {
      title: t.navigation.collect,
      items: [{ name: t.navigation.sources, href: "/sources", icon: FileText }],
    },
    {
      title: t.navigation.process,
      items: [
        { name: "Courses", href: "/courses", icon: Book },
        { name: t.navigation.modules, href: "/modules", icon: Book },
        { name: t.navigation.askAndSearch, href: "/search", icon: Search },
      ],
    },
    {
      title: t.navigation.manage,
      items: [
        {
          name: t.navigation.transformations,
          href: "/transformations",
          icon: Shuffle,
        },
        { name: t.navigation.settings, href: "/settings", icon: Settings },
        { name: t.navigation.advanced, href: "/advanced", icon: Wrench },
      ],
    },
  ] as const;

type CreateTarget = "source" | "module";

export function AppSidebar() {
  const { t } = useTranslation();
  const navigation = getNavigation(t);
  const pathname = usePathname();
  const { logout } = useAuth();
  const { isCollapsed, toggleCollapse } = useSidebarStore();
  const { openSourceDialog, openModuleDialog } = useCreateDialogs();

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(true); // Default to Mac for SSR

  // Detect platform for keyboard shortcut display
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  const handleCreateSelection = (target: CreateTarget) => {
    setCreateMenuOpen(false);

    if (target === "source") {
      openSourceDialog();
    } else if (target === "module") {
      openModuleDialog();
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "app-sidebar flex h-full flex-col bg-sidebar border-sidebar-border border-r transition-all duration-300",
          isCollapsed ? "w-16" : "w-60" // Updated width to 240px expanded
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center group",
            isCollapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          {isCollapsed ? (
            <div className="relative flex items-center justify-center w-full">
              <Image
                src="/logo.svg"
                alt={BRAND_NAME}
                width={32}
                height={32}
                className="transition-opacity group-hover:opacity-0"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapse}
                className="absolute text-sidebar-foreground hover:bg-sidebar-accent opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.svg"
                  alt={BRAND_NAME}
                  width={32}
                  height={32}
                />
                {/* Brand name using serif font (EB Garamond) */}
                <span className="text-xl font-heading font-medium text-sidebar-foreground tracking-tight">
                  {BRAND_NAME}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapse}
                className="text-sidebar-foreground hover:bg-sidebar-accent"
                data-testid="sidebar-toggle"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <nav
          className={cn("flex-1 space-y-1 py-4", isCollapsed ? "px-2" : "px-3")}
        >
          <div className={cn("mb-4", isCollapsed ? "px-0" : "px-3")}>
            <DropdownMenu
              open={createMenuOpen}
              onOpenChange={setCreateMenuOpen}
            >
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        onClick={() => setCreateMenuOpen(true)}
                        variant="default"
                        size="sm"
                        className="w-full justify-center px-2 bg-primary hover:bg-primary/90 text-primary-foreground border-0"
                        aria-label={t.common.create}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t.common.create}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuTrigger asChild>
                  <Button
                    onClick={() => setCreateMenuOpen(true)}
                    variant="default"
                    size="sm"
                    className="w-full justify-start bg-primary hover:bg-primary/90 text-primary-foreground border-0"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t.common.create}
                  </Button>
                </DropdownMenuTrigger>
              )}

              <DropdownMenuContent
                align={isCollapsed ? "end" : "start"}
                side={isCollapsed ? "right" : "bottom"}
                className="w-48"
              >
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleCreateSelection("source");
                  }}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {t.common.source}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleCreateSelection("module");
                  }}
                  className="gap-2"
                >
                  <Book className="h-4 w-4" />
                  {t.common.module}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {navigation.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="space-y-0.5">
                {/* Figma: EB Garamond Regular 18px, underlined, primary color, -1% letter spacing */}
                {!isCollapsed && (
                  <h3 className="mb-1 font-heading text-lg font-normal text-foreground underline underline-offset-4 decoration-1 tracking-tight">
                    {section.title}
                  </h3>
                )}

                {section.items.map((item) => {
                  const isActive = pathname?.startsWith(item.href) || false;
                  // Figma sidebar item: Figtree Regular 14px, rounded-sm (8px)
                  // Active: bg-sidebar-accent (#ecf1d5), text-foreground (#14302e)
                  // Default: no bg, text-teal-800 (secondary text)
                  // Hover: bg-secondary (#f0f1eb), text-foreground
                  const button = (
                    <div
                      className={cn(
                        "flex items-center gap-3 w-full px-1 py-2 rounded-sm text-sm font-normal transition-all",
                        // Default: secondary text color
                        "text-teal-800",
                        // Hover: secondary background, primary text
                        "hover:bg-secondary hover:text-foreground",
                        // Active: accent background, primary text
                        isActive && "bg-sidebar-accent text-foreground",
                        isCollapsed ? "justify-center px-2" : "justify-start"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && <span>{item.name}</span>}
                    </div>
                  );

                  if (isCollapsed) {
                    return (
                      <Tooltip key={item.name}>
                        <TooltipTrigger asChild>
                          <Link href={item.href}>{button}</Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Link key={item.name} href={item.href}>
                      {button}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "border-t border-sidebar-border p-3 space-y-2",
            isCollapsed && "px-2"
          )}
        >
          {/* Command Palette hint */}
          {!isCollapsed && (
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/60">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Command className="h-3 w-3" />
                  {t.common.quickActions}
                </span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {isMac ? (
                    <span className="text-xs">⌘</span>
                  ) : (
                    <span>Ctrl+</span>
                  )}
                  K
                </kbd>
              </div>
              <p className="mt-1 text-[10px] text-sidebar-foreground/40">
                {t.common.quickActionsDesc}
              </p>
            </div>
          )}

          <div
            className={cn(
              "flex flex-col gap-2",
              isCollapsed ? "items-center" : "items-stretch"
            )}
          >
            {isCollapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <ThemeToggle iconOnly />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t.common.theme}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <LanguageToggle iconOnly />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t.common.language}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <ThemeToggle />
                <LanguageToggle />
              </>
            )}
          </div>

          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-center sidebar-menu-item"
                  onClick={logout}
                  aria-label={t.common.signOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t.common.signOut}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-3 sidebar-menu-item"
              onClick={logout}
              aria-label={t.common.signOut}
            >
              <LogOut className="h-4 w-4" />
              {t.common.signOut}
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
