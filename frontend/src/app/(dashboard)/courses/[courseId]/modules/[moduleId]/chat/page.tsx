"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CourseHeader } from "@/components/courses";
import { useModule } from "@/lib/hooks/use-modules";
import { useCourse } from "@/lib/hooks/use-courses";
import { useModuleSources } from "@/lib/hooks/use-sources";
import { useNotes } from "@/lib/hooks/use-notes";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useModuleChat } from "@/lib/hooks/useModuleChat";
import { ChatPanel } from "@/components/source/ChatPanel";
import { getCoursePermissions } from "@/lib/permissions/course";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ExternalLink,
  Upload,
  FileText,
} from "lucide-react";
import { SourceListResponse } from "@/lib/types/api";
import { useModalManager } from "@/lib/hooks/use-modal-manager";
import type { ContextSelections, ContextMode } from "@/app/(dashboard)/modules/[id]/page";

// ─── Source type helpers ─────────────────────────────────────────────────────

function getSourceType(source: SourceListResponse): "link" | "upload" | "text" {
  if (source.asset?.url) return "link";
  if (source.asset?.file_path) return "upload";
  return "text";
}

const SOURCE_TYPE_ICONS = {
  link: ExternalLink,
  upload: Upload,
  text: FileText,
} as const;

// ─── Chat Panel wrapper ──────────────────────────────────────────────────────

interface ModuleChatPanelProps {
  moduleId: string;
  contextSelections: ContextSelections;
  sources: SourceListResponse[];
}

function ModuleChatPanelWrapper({
  moduleId,
  contextSelections,
  sources,
}: ModuleChatPanelProps) {
  const { data: notes = [] } = useNotes(moduleId);

  const chat = useModuleChat({
    moduleId,
    sources,
    notes,
    contextSelections,
  });

  const sourcesInsights = sources.filter(
    (s) => contextSelections.sources[s.id] === "insights"
  ).length;
  const sourcesFull = sources.filter(
    (s) => contextSelections.sources[s.id] === "full"
  ).length;

  return (
    <ChatPanel
      title="Chat with Module"
      contextType="module"
      messages={chat.messages}
      isStreaming={chat.isSending}
      contextIndicators={null}
      onSendMessage={(message) => chat.sendMessage(message)}
      sessions={chat.sessions}
      currentSessionId={chat.currentSessionId}
      onCreateSession={(title) => chat.createSession(title)}
      onSelectSession={chat.switchSession}
      onUpdateSession={(sessionId, title) =>
        chat.updateSession(sessionId, { title })
      }
      onDeleteSession={chat.deleteSession}
      loadingSessions={chat.loadingSessions}
      moduleContextStats={{
        sourcesInsights,
        sourcesFull,
        notesCount: 0,
        tokenCount: chat.tokenCount,
        charCount: chat.charCount,
      }}
      moduleId={moduleId}
      voiceEnabled
      getVoiceContextPayload={async () => {
        if (!chat.currentSessionId) return null;
        const moduleContext = await chat.buildContextForVoice();
        return {
          surface: "module",
          session_id: chat.currentSessionId,
          module_id: moduleId,
          model_override: chat.currentSession?.model_override ?? null,
          module_context: moduleContext,
        };
      }}
      onAppendVoiceTurn={chat.appendVoiceTurn}
    />
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function StudentChatPage() {
  const params = useParams();
  const courseId = params?.courseId
    ? decodeURIComponent(params.courseId as string)
    : "";
  const moduleId = params?.moduleId
    ? decodeURIComponent(params.moduleId as string)
    : "";

  const { data: course, isLoading: courseLoading } = useCourse(courseId);
  const { data: module, isLoading: moduleLoading } = useModule(moduleId);
  const { sources, isLoading: sourcesLoading } = useModuleSources(moduleId);
  const { openModal } = useModalManager();

  // Redirect non-students — only students should access this route
  const permissions = getCoursePermissions(course?.membership_role);

  const [contextSelections, setContextSelections] = useState<ContextSelections>(
    { sources: {}, notes: {} }
  );

  // Initialize all sources as included
  useEffect(() => {
    if (sources && sources.length > 0) {
      setContextSelections((prev) => {
        const updated = { ...prev.sources };
        sources.forEach((source) => {
          if (!(source.id in updated)) {
            updated[source.id] =
              source.insights_count > 0 ? "insights" : "full";
          }
        });
        return { ...prev, sources: updated };
      });
    }
  }, [sources]);

  const toggleSource = (sourceId: string) => {
    const current = contextSelections.sources[sourceId] ?? "off";
    const next: ContextMode =
      current === "off"
        ? (sources.find((s) => s.id === sourceId)?.insights_count ?? 0) > 0
          ? "insights"
          : "full"
        : "off";
    setContextSelections((prev) => ({
      ...prev,
      sources: { ...prev.sources, [sourceId]: next },
    }));
  };

  const includedCount = sources.filter(
    (s) => contextSelections.sources[s.id] !== "off"
  ).length;

  if (moduleLoading || courseLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!module) {
    return (
      <AppShell>
        <div className="p-8">
          <h1 className="text-title text-teal-800 mb-2">Module not found</h1>
          <Button asChild>
            <Link href={`/courses/${encodeURIComponent(courseId)}`}>
              Back to course
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Course Header */}
        <div className="flex-shrink-0 px-8 pt-8">
          {course && (
            <CourseHeader
              courseId={courseId}
              courseName={course.title}
              membershipRole={course.membership_role}
            />
          )}
        </div>

        {/* Chat area */}
        <div className="flex flex-1 min-h-0 mt-4">
          {/* Left sidebar: source context selection */}
          <div className="w-64 flex-shrink-0 flex flex-col border-r border-border">
            {/* Sidebar header */}
            <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
              <Link
                href={`/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to module
              </Link>
              <h3 className="text-sm font-medium text-teal-800 truncate">{module.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {includedCount} of {sources.length} sources in context
              </p>
            </div>

            {/* Source list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {sourcesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="sm" />
                </div>
              ) : sources.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 italic">
                  No sources in this module yet.
                </p>
              ) : (
                sources.map((source) => {
                  const sourceType = getSourceType(source);
                  const SourceTypeIcon = SOURCE_TYPE_ICONS[sourceType];
                  const isIncluded =
                    (contextSelections.sources[source.id] ?? "off") !== "off";
                  const title = source.title || "Untitled Source";

                  return (
                    <div
                      key={source.id}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-md border transition-colors cursor-pointer",
                        isIncluded
                          ? "border-border bg-sidebar-accent"
                          : "border-transparent hover:bg-secondary"
                      )}
                      onClick={() => openModal("source", source.id)}
                    >
                      {/* Toggle button */}
                      <button
                        type="button"
                        className={cn(
                          "flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 transition-colors",
                          isIncluded
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/50 hover:border-primary"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSource(source.id);
                        }}
                        title={isIncluded ? "Remove from context" : "Add to context"}
                      >
                        {isIncluded && (
                          <svg
                            className="w-full h-full text-primary-foreground"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <path
                              d="M3 8l3.5 3.5L13 5"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <SourceTypeIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span
                            className="text-xs font-medium truncate leading-tight"
                            title={title}
                          >
                            {title}
                          </span>
                        </div>
                        {source.insights_count > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {source.insights_count} insight
                            {source.insights_count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: Chat */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ModuleChatPanelWrapper
              moduleId={moduleId}
              contextSelections={contextSelections}
              sources={sources}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
