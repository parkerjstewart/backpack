"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ModuleHeader } from "../components/ModuleHeader";
import { SourcesColumn } from "../components/SourcesColumn";
import { ModuleDetails } from "../components/ModuleDetails";
import { useModule } from "@/lib/hooks/use-modules";
import { useModuleSources } from "@/lib/hooks/use-sources";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useModuleColumnsStore } from "@/lib/stores/module-columns-store";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { useTranslation } from "@/lib/hooks/use-translation";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText } from "lucide-react";

export type ContextMode = "off" | "insights" | "full";

export interface ContextSelections {
  sources: Record<string, ContextMode>;
  notes: Record<string, ContextMode>;
}

export default function ModulePage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();

  // Ensure the module ID is properly decoded from URL
  const moduleId = params?.id ? decodeURIComponent(params.id as string) : "";

  const { data: module, isLoading: moduleLoading } = useModule(moduleId);

  // Redirect to course-scoped page if module belongs to a course
  useEffect(() => {
    if (module?.course_id) {
      router.replace(
        `/courses/${encodeURIComponent(module.course_id)}/modules/${encodeURIComponent(moduleId)}`
      );
    }
  }, [module, moduleId, router]);

  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useModuleSources(moduleId);

  // Get collapse states for dynamic layout
  const { sourcesCollapsed } = useModuleColumnsStore();

  // Detect desktop
  const isDesktop = useIsDesktop();

  // Mobile tab state (Sources or Details)
  const [mobileActiveTab, setMobileActiveTab] = useState<"sources" | "details">(
    "sources",
  );

  if (moduleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Redirect pending — show spinner while navigating
  if (module?.course_id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!module) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t.modules.notFound}</h1>
          <p className="text-muted-foreground">{t.modules.notFoundDesc}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 p-6 pb-0">
          <ModuleHeader module={module} />
        </div>

        <div className="flex-1 p-6 pt-6 overflow-x-auto flex flex-col">
          {/* Mobile: Tabbed interface */}
          {!isDesktop && (
            <>
              <div className="lg:hidden mb-4">
                <Tabs
                  value={mobileActiveTab}
                  onValueChange={(value) =>
                    setMobileActiveTab(value as "sources" | "details")
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="sources" className="gap-2">
                      <FileText className="h-4 w-4" />
                      {t.navigation.sources}
                    </TabsTrigger>
                    <TabsTrigger value="details" className="gap-2">
                      Details
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile: Show only active tab */}
              <div className="flex-1 overflow-hidden lg:hidden">
                {mobileActiveTab === "sources" && (
                  <SourcesColumn
                    sources={sources}
                    isLoading={sourcesLoading}
                    moduleId={moduleId}
                    moduleName={module?.name}
                    onRefresh={refetchSources}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    fetchNextPage={fetchNextPage}
                  />
                )}
                {mobileActiveTab === "details" && module && (
                  <ModuleDetails module={module} />
                )}
              </div>
            </>
          )}

          {/* Desktop: Two-column layout */}
          <div
            className={cn(
              "hidden lg:flex h-full min-h-0 gap-6 transition-all duration-150",
              "flex-row",
            )}
          >
            {/* Sources Column */}
            <div
              className={cn(
                "transition-all duration-150",
                sourcesCollapsed ? "w-12 flex-shrink-0" : "flex-none basis-1/3",
              )}
            >
              <SourcesColumn
                sources={sources}
                isLoading={sourcesLoading}
                moduleId={moduleId}
                moduleName={module?.name}
                onRefresh={refetchSources}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={fetchNextPage}
              />
            </div>

            {/* Module Details Column - always expanded, takes remaining space */}
            <div className="transition-all duration-150 flex-1 overflow-y-auto lg:pr-6 lg:-mr-6">
              {module && <ModuleDetails module={module} />}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
