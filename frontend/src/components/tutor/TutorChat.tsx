'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, User, Send, Loader2, Target, CheckCircle2, Mic, Pencil, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeLatexDelimiters } from '@/lib/utils'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useVoiceSession } from '@/lib/hooks/useVoiceSession'
import { toast } from 'sonner'
import { Artifact } from '@/lib/types/api'

interface Message {
  id: string
  type: 'tutor' | 'student'
  content: string
  artifact_content?: string | null
  highlighted_artifact_id?: string | null
  image_url?: string | null
  timestamp: string
}

interface TutorChatProps {
  messages: Message[]
  artifacts?: Artifact[]
  isSending: boolean
  isInitializing: boolean
  onSendMessage: (message: string, attachDrawing?: boolean) => void
  currentGoal: string | null
  goalsCompleted: number
  goalsRemaining: number
  isSessionComplete: boolean
  moduleName?: string
  moduleId?: string
  sessionId?: string | null
  onAppendVoiceTurn?: (studentText: string, tutorText: string, artifactContent?: string | null, imageUrl?: string | null, newArtifacts?: Artifact[], highlightedArtifactId?: string | null) => void
  canAttachDrawing?: boolean
  getWhiteboardPng?: () => Promise<string | null>
  suggestions?: string[]
  isSuggestionsLoading?: boolean
  streamingMessage?: string
  className?: string
}

export function TutorChat({
  messages,
  artifacts = [],
  isSending,
  isInitializing,
  onSendMessage,
  currentGoal,
  goalsCompleted,
  goalsRemaining,
  isSessionComplete,
  moduleName,
  moduleId,
  sessionId,
  onAppendVoiceTurn,
  canAttachDrawing = false,
  getWhiteboardPng,
  suggestions = [],
  isSuggestionsLoading = false,
  streamingMessage = '',
  className,
}: TutorChatProps) {
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<string>>(new Set())
  const { t } = useTranslation()
  const inputId = useId()
  const [input, setInput] = useState('')
  const [attachDrawing, setAttachDrawing] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const voiceTranscriptRef = useRef('')
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Determine which artifact is highlighted by the most recent tutor message
  const lastTutorMessage = [...messages].reverse().find(m => m.type === 'tutor')
  const activeHighlightId = lastTutorMessage?.highlighted_artifact_id ?? null

  // Auto-scroll to bottom when new messages arrive.
  // Scroll the Radix viewport directly to avoid scrollIntoView bubbling up
  // to outer containers and collapsing the visible chat area.
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      ) as HTMLElement | null
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [messages, streamingMessage])

  // Auto-expand the highlighted artifact when it changes
  useEffect(() => {
    if (activeHighlightId) {
      setExpandedArtifactIds(prev => new Set([...prev, activeHighlightId]))
    }
  }, [activeHighlightId])

  const handleSend = () => {
    if (input.trim() && !isSending && !isSessionComplete) {
      onSendMessage(input.trim(), attachDrawing)
      setInput('')
      setAttachDrawing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const keyHint = 'Enter'

  const {
    isRecording,
    isAssistantThinking,
    assistantStreamingText,
    startRecording,
    stopRecording,
  } = useVoiceSession({
    getWhiteboardPng,
    getContextPayload: async () => {
      if (!sessionId) return null
      return {
        surface: 'tutor',
        session_id: sessionId,
        module_id: moduleId,
      }
    },
    onFinalTranscript: (text) => {
      setVoiceTranscript(text)
      voiceTranscriptRef.current = text
    },
    onAssistantTextFinal: (text, artifactContent, imageUrl, artifacts, highlightedArtifactId) => {
      if (voiceTranscriptRef.current && onAppendVoiceTurn) {
        onAppendVoiceTurn(voiceTranscriptRef.current, text, artifactContent, imageUrl, artifacts, highlightedArtifactId)
      }
      setVoiceTranscript('')
      voiceTranscriptRef.current = ''
    },
    onError: (message) => {
      toast.error(message)
    },
  })

  if (isInitializing) {
    return (
      <Card className={`flex flex-col h-full flex-1 overflow-hidden ${className ?? ''}`}>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">{t.tutor.initializing}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`flex flex-col h-full flex-1 overflow-hidden ${className ?? ''}`}>
      <CardHeader className="pb-3 flex-shrink-0 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {t.tutor.reviewSession}
            {moduleName && <span className="text-muted-foreground font-normal">- {moduleName}</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {isSessionComplete ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3 w-3" />
                {t.tutor.complete}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <Target className="h-3 w-3" />
                {goalsCompleted}/{goalsCompleted + goalsRemaining} {t.tutor.goals}
              </Badge>
            )}
          </div>
        </div>
        {currentGoal && !isSessionComplete && (
          <div className="text-sm text-muted-foreground mt-2">
            <span className="font-medium">{t.tutor.currentGoal}:</span> {currentGoal}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-row min-h-0 p-0 overflow-hidden">
        {/* Main chat column */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollAreaRef}>
            <div className="space-y-4 py-4">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">{t.tutor.startingSession}</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.type === 'student' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.type === 'tutor' && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <GraduationCap className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 max-w-[80%]">
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          message.type === 'student'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {message.type === 'tutor' ? (
                          <div className="prose prose-sm prose-neutral max-w-none break-words">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {normalizeLatexDelimiters(message.content)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm break-words overflow-wrap-anywhere">
                            {message.content}
                          </p>
                        )}
                      </div>
                    </div>
                    {message.type === 'student' && (
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {isSending && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <GraduationCap className="h-4 w-4" />
                    </div>
                  </div>
                  {streamingMessage ? (
                    <div className="rounded-lg px-4 py-2 bg-muted max-w-[80%]">
                      <div className="prose prose-sm prose-neutral max-w-none break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {streamingMessage}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg px-4 py-2 bg-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </div>
              )}
              {voiceTranscript && (
                <div className="flex gap-3 justify-end">
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                      <p className="text-sm break-words overflow-wrap-anywhere">{voiceTranscript}</p>
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
                      <GraduationCap className="h-4 w-4" />
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
                      <GraduationCap className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-muted max-w-[80%]">
                    <div className="prose prose-sm prose-neutral max-w-none break-words">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {assistantStreamingText}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="flex-shrink-0 p-4 space-y-3 border-t">
            {isSessionComplete ? (
              <div className="text-center text-muted-foreground py-2">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                <p className="text-sm">{t.tutor.sessionComplete}</p>
              </div>
            ) : (
              <>
                {/* Quick reply suggestion pills */}
                {(isSuggestionsLoading || suggestions.length > 0) && !isSending && (
                  <div className="flex flex-wrap gap-2">
                    {isSuggestionsLoading && suggestions.length === 0
                      ? [1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="h-7 w-24 rounded-full bg-muted animate-pulse"
                            style={{ width: `${60 + i * 20}px` }}
                          />
                        ))
                      : suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onSendMessage(s)}
                            className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
                          >
                            {s}
                          </button>
                        ))
                    }
                  </div>
                )}
                {(isRecording || voiceTranscript) && (
                  <p className="text-xs text-muted-foreground">
                    {isRecording ? 'Recording...' : voiceTranscript}
                  </p>
                )}
                <div className="flex gap-2 items-end">
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="icon"
                  className="h-[40px] w-[40px] flex-shrink-0"
                  disabled={!sessionId || isSending}
                  onClick={() => {
                    if (isRecording) {
                      stopRecording()
                    } else {
                      startRecording()
                    }
                  }}
                  title={isRecording ? 'Click to stop and send' : 'Click to start recording'}
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Textarea
                  id={inputId}
                  name="student-response"
                  autoComplete="off"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`${t.tutor.responsePlaceholder} (${t.chat.pressToSend.replace('{key}', keyHint)})`}
                  disabled={isSending}
                  className="flex-1 min-h-[40px] max-h-[100px] resize-none py-2 px-3"
                  rows={1}
                />
                {canAttachDrawing && (
                  <Button
                    type="button"
                    variant={attachDrawing ? 'default' : 'outline'}
                    size="icon"
                    className="h-[40px] w-[40px] flex-shrink-0"
                    onClick={() => setAttachDrawing(v => !v)}
                    title={attachDrawing ? 'Drawing will be attached to message' : 'Click to attach whiteboard drawing'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  size="icon"
                  className="h-[40px] w-[40px] flex-shrink-0"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Artifacts sidebar — only shown when there are artifacts */}
        {artifacts.length > 0 && (
          <div className="w-56 flex-shrink-0 border-l flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/30">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">References</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1.5">
                {artifacts.map((art) => {
                  const isHighlighted = art.id === activeHighlightId
                  const isExpanded = expandedArtifactIds.has(art.id)
                  return (
                    <div
                      key={art.id}
                      className={`rounded-md border text-xs transition-colors ${
                        isHighlighted
                          ? 'border-green-500/40 bg-green-50 ring-1 ring-green-500/20'
                          : 'border-border bg-background'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left hover:bg-secondary/50 rounded-md transition-colors"
                        onClick={() => setExpandedArtifactIds(prev => {
                          const next = new Set(prev)
                          if (next.has(art.id)) {
                            next.delete(art.id)
                          } else {
                            next.add(art.id)
                          }
                          return next
                        })}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        }
                        <span className={`font-medium truncate ${isHighlighted ? 'text-green-700' : ''}`}>
                          {art.label}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-2.5 pb-2.5">
                          <div className="prose prose-xs prose-neutral max-w-none text-xs">
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {normalizeLatexDelimiters(art.content)}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
