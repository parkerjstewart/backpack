"use client";

import { useState, useRef, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bot,
  User,
  Send,
  Loader2,
  FileText,
  Lightbulb,
  StickyNote,
  Clock,
  Mic,
  Plus,
  Trash2,
} from "lucide-react";
import { MathMarkdown } from "@/components/ui/math-markdown";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/utils/date-locale";
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession,
  VoiceContextPayload,
} from "@/lib/types/api";
import { ContextIndicator } from "@/components/common/ContextIndicator";
import { MessageActions } from "@/components/source/MessageActions";
import {
  convertReferencesToCompactMarkdown,
  createCompactReferenceLinkComponent,
} from "@/lib/utils/source-references";
import { useModalManager } from "@/lib/hooks/use-modal-manager";
import { toast } from "sonner";
import { useTranslation } from "@/lib/hooks/use-translation";
import { useVoiceSession } from "@/lib/hooks/useVoiceSession";

interface ModuleContextStats {
  sourcesInsights: number;
  sourcesFull: number;
  notesCount: number;
  tokenCount?: number;
  charCount?: number;
}

interface ChatPanelProps {
  messages: SourceChatMessage[];
  isStreaming: boolean;
  contextIndicators: SourceChatContextIndicator | null;
  onSendMessage: (message: string) => void;
  // Session management props
  sessions?: BaseChatSession[];
  currentSessionId?: string | null;
  onCreateSession?: (title: string) => void;
  onSelectSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onUpdateSession?: (sessionId: string, title: string) => void;
  loadingSessions?: boolean;
  // Generic props for reusability
  title?: string;
  contextType?: "source" | "module";
  // Module context stats (for module chat)
  moduleContextStats?: ModuleContextStats;
  // Module ID for saving notes
  moduleId?: string;
  voiceEnabled?: boolean;
  getVoiceContextPayload?: () => Promise<VoiceContextPayload | null>;
  onAppendVoiceTurn?: (studentText: string, aiText: string) => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  contextIndicators,
  onSendMessage,
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions = false,
  title,
  contextType = "source",
  moduleContextStats,
  moduleId,
  voiceEnabled = false,
  getVoiceContextPayload,
  onAppendVoiceTurn,
}: ChatPanelProps) {
  const { t, language } = useTranslation();
  const chatInputId = useId();
  const [input, setInput] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const voiceTranscriptRef = useRef("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { openModal } = useModalManager();

  const handleReferenceClick = (type: string, id: string) => {
    const modalType =
      type === "source_insight"
        ? "insight"
        : (type as "source" | "note" | "insight");

    try {
      openModal(modalType, id);
      // Note: The modal system uses URL parameters and doesn't throw errors for missing items.
      // The modal component itself will handle displaying "not found" states.
      // This try-catch is here for future enhancements or unexpected errors.
    } catch {
      toast.error(t.common.noResults);
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const keyHint = "Enter";

  const {
    isRecording,
    isAssistantThinking,
    assistantStreamingText,
    startRecording,
    stopRecording,
  } =
    useVoiceSession({
      getContextPayload: async () => {
        if (!voiceEnabled || !getVoiceContextPayload) return null;
        return getVoiceContextPayload();
      },
      onFinalTranscript: (text) => {
        setVoiceTranscript(text);
        voiceTranscriptRef.current = text;
      },
      onAssistantTextFinal: (text) => {
        if (voiceTranscriptRef.current && onAppendVoiceTurn) {
          onAppendVoiceTurn(voiceTranscriptRef.current, text);
        }
        setVoiceTranscript("");
        voiceTranscriptRef.current = "";
      },
      onError: (message) => toast.error(message),
    });

  const handleDeleteConfirm = () => {
    if (deleteSessionId && onDeleteSession) {
      onDeleteSession(deleteSessionId);
      setDeleteConfirmOpen(false);
      setDeleteSessionId(null);
    }
  };

  return (
    <>
      <Card className="flex flex-col h-full flex-1 overflow-hidden">
        <CardHeader className="py-4 px-5 flex-shrink-0 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-muted-foreground" />
              {title ||
                (contextType === "source"
                  ? t.chat.chatWith.replace("{name}", t.navigation.sources)
                  : t.chat.chatWith.replace("{name}", t.common.module))}
            </div>
            <div className="flex items-center gap-1">
              {/* Create new session */}
              {onCreateSession && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onCreateSession(t.chat.newChat)}
                  disabled={loadingSessions}
                  title={t.chat.newChat}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
              {/* Session history dropdown */}
              {onSelectSession && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={loadingSessions}
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>{t.chat.sessions}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {sessions.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                        {t.chat.noSessions}
                      </div>
                    ) : (
                      sessions.map((session) => (
                        <DropdownMenuItem
                          key={session.id}
                          onClick={() => onSelectSession(session.id)}
                          className="flex items-start justify-between gap-2 py-2"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span
                              className={`text-sm truncate ${
                                currentSessionId === session.id
                                  ? "font-semibold"
                                  : ""
                              }`}
                            >
                              {session.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(session.created), {
                                addSuffix: true,
                                locale: getDateLocale(language),
                              })}
                              {session.message_count != null &&
                                session.message_count > 0 &&
                                ` · ${t.chat.messagesCount.replace(
                                  "{count}",
                                  session.message_count.toString()
                                )}`}
                            </span>
                          </div>
                          {onDeleteSession && (
                            <button
                              type="button"
                              className="flex-shrink-0 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDeleteSessionId(session.id);
                                setDeleteConfirmOpen(true);
                              }}
                              title={t.chat.deleteSession}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          <ScrollArea className="flex-1 min-h-0 px-6" ref={scrollAreaRef}>
            <div className="space-y-5 py-5">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">
                    {t.chat.startConversation.replace(
                      "{type}",
                      contextType === "source"
                        ? t.navigation.sources
                        : t.common.module
                    )}
                  </p>
                  <p className="text-xs mt-2">{t.chat.askQuestions}</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.type === "human" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.type === "ai" && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Bot className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 max-w-[80%]">
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          message.type === "human"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {message.type === "ai" ? (
                          <AIMessageContent
                            content={message.content}
                            onReferenceClick={handleReferenceClick}
                          />
                        ) : (
                          <p className="text-sm break-words overflow-wrap-anywhere">
                            {message.content}
                          </p>
                        )}
                      </div>
                      {message.type === "ai" && (
                        <MessageActions
                          content={message.content}
                          moduleId={moduleId}
                        />
                      )}
                    </div>
                    {message.type === "human" && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {isStreaming && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              {voiceTranscript && (
                <div className="flex gap-3 justify-end">
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                      <p className="text-sm break-words overflow-wrap-anywhere">
                        {voiceTranscript}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                </div>
              )}
              {isAssistantThinking && !assistantStreamingText && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              {assistantStreamingText && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-muted text-sm">
                    {assistantStreamingText}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Context Indicators */}
          {contextIndicators && (
            <div className="border-t px-5 py-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {contextIndicators.sources?.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {contextIndicators.sources.length} {t.navigation.sources}
                  </Badge>
                )}
                {contextIndicators.insights?.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Lightbulb className="h-3 w-3" />
                    {contextIndicators.insights.length}{" "}
                    {contextIndicators.insights.length === 1
                      ? t.common.insight
                      : t.common.insights}
                  </Badge>
                )}
                {contextIndicators.notes?.length > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <StickyNote className="h-3 w-3" />
                    {contextIndicators.notes.length}{" "}
                    {contextIndicators.notes.length === 1
                      ? t.common.note
                      : t.common.notes}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Module Context Indicator */}
          {moduleContextStats && (
            <ContextIndicator
              sourcesInsights={moduleContextStats.sourcesInsights}
              sourcesFull={moduleContextStats.sourcesFull}
              notesCount={moduleContextStats.notesCount}
              tokenCount={moduleContextStats.tokenCount}
              charCount={moduleContextStats.charCount}
            />
          )}

          {/* Input Area */}
          <div className="flex-shrink-0 px-5 py-4 space-y-3 border-t">
            {(isRecording || voiceTranscript) && (
              <p className="text-xs text-muted-foreground">
                {isRecording ? "Recording..." : voiceTranscript}
              </p>
            )}
            <div className="flex gap-2 items-end">
              {voiceEnabled && (
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="icon"
                  className="h-[40px] w-[40px] flex-shrink-0"
                  disabled={isStreaming}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startRecording();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    stopRecording();
                  }}
                  onPointerCancel={(e) => {
                    e.preventDefault();
                    if (isRecording) {
                      stopRecording();
                    }
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    if (isRecording) {
                      stopRecording();
                    }
                  }}
                  title={isRecording ? "Release to send" : "Hold to talk"}
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
              <Textarea
                id={chatInputId}
                name="chat-message"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`${
                  t.chat.sendPlaceholder
                } (${t.chat.pressToSend.replace("{key}", keyHint)})`}
                disabled={isStreaming}
                className="flex-1 min-h-[40px] max-h-[100px] resize-none py-2 px-3"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="h-[40px] w-[40px] flex-shrink-0"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chat.deleteSession}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.chat.deleteSessionDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper component to render AI messages with clickable references
function AIMessageContent({
  content,
  onReferenceClick,
}: {
  content: string;
  onReferenceClick: (type: string, id: string) => void;
}) {
  const { t } = useTranslation();
  // Convert references to compact markdown with numbered citations
  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(
    content,
    t.common.references
  );

  // Create custom link component for compact references
  const LinkComponent = createCompactReferenceLinkComponent(onReferenceClick);

  return (
    <div className="prose prose-sm prose-neutral max-w-none break-words prose-headings:font-semibold prose-a:text-info prose-a:break-all prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-p:mb-4 prose-p:leading-7 prose-li:mb-2">
      <MathMarkdown
        components={{
          a: LinkComponent,
          p: ({ children }) => <p className="mb-4">{children}</p>,
          h1: ({ children }) => <h1 className="mb-4 mt-6">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-5">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-3 mt-4">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-2 mt-4">{children}</h4>,
          h5: ({ children }) => <h5 className="mb-2 mt-3">{children}</h5>,
          h6: ({ children }) => <h6 className="mb-2 mt-3">{children}</h6>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          ul: ({ children }) => <ul className="mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 space-y-1">{children}</ol>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),
        }}
      >
        {markdownWithCompactRefs}
      </MathMarkdown>
    </div>
  );
}
