'use client'

import { useState, useRef, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Loader2, Target, CheckCircle2, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { ChatInput } from '@/components/common/ChatInput'
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
  getWhiteboardPng,
  suggestions = [],
  isSuggestionsLoading = false,
  streamingMessage = '',
  className,
}: TutorChatProps) {
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<string>>(new Set())
  const autoExpandedIdRef = useRef<string | null>(null)
  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(true)

  // Determine which artifact is highlighted by the most recent tutor message
  const lastTutorMessage = [...messages].reverse().find(m => m.type === 'tutor')
  const activeHighlightId = lastTutorMessage?.highlighted_artifact_id ?? null

  // When the active highlight changes: collapse the previously auto-expanded item,
  // auto-expand the new one.
  useEffect(() => {
    const prevAutoId = autoExpandedIdRef.current
    if (prevAutoId && prevAutoId !== activeHighlightId) {
      setExpandedArtifactIds(prev => {
        const next = new Set(prev)
        next.delete(prevAutoId)
        return next
      })
    }
    if (activeHighlightId) {
      setExpandedArtifactIds(prev => new Set([...prev, activeHighlightId]))
      autoExpandedIdRef.current = activeHighlightId
    } else {
      autoExpandedIdRef.current = null
    }
  }, [activeHighlightId])

  const { t } = useTranslation()
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const voiceTranscriptRef = useRef('')
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive.
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
      <div className={`flex flex-col h-full flex-1 overflow-hidden items-center justify-center ${className ?? ''}`}>
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">{t.tutor.initializing}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full flex-1 overflow-hidden ${className ?? ''}`}>
      {/* Goal / progress header — no card chrome */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        {currentGoal && !isSessionComplete && (
          <p className="text-sm text-muted-foreground truncate">
            <span className="font-medium">{t.tutor.currentGoal}:</span>{' '}{currentGoal}
          </p>
        )}
        {isSessionComplete ? (
          <Badge variant="default" className="gap-1 bg-green-600 flex-shrink-0 ml-auto">
            <CheckCircle2 className="h-3 w-3" />
            {t.tutor.complete}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 flex-shrink-0 ml-auto">
            <Target className="h-3 w-3" />
            {goalsCompleted}/{goalsCompleted + goalsRemaining} {t.tutor.goals}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollAreaRef}>
        <div className="space-y-4 pt-3 pb-24">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">{t.tutor.startingSession}</p>
            </div>
          ) : (() => {
            // Find the indices of the last two tutor messages to compute exchange boundaries.
            const tutorIndices = messages
              .map((m, i) => (m.type === 'tutor' ? i : -1))
              .filter(i => i !== -1)
            const latestTutorIdx = tutorIndices.length > 0 ? tutorIndices[tutorIndices.length - 1] : -1
            const prevTutorIdx = tutorIndices.length > 1 ? tutorIndices[tutorIndices.length - 2] : -1

            return messages.map((message, idx) => {
              const isLatestExchange = latestTutorIdx !== -1 && idx >= latestTutorIdx
              const isPrevExchange = prevTutorIdx !== -1 && idx >= prevTutorIdx && !isLatestExchange
              const opacityClass = isLatestExchange
                ? 'opacity-100'
                : isPrevExchange
                  ? 'opacity-50 hover:opacity-100 transition-opacity duration-200'
                  : 'opacity-30 hover:opacity-100 transition-opacity duration-200'

              const showSeparator = idx === latestTutorIdx && latestTutorIdx > 0

              return (
                <div key={message.id}>
                  {showSeparator && (
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 border-t border-border/50" />
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider flex-shrink-0">now</span>
                      <div className="flex-1 border-t border-border/50" />
                    </div>
                  )}
                  <div
                    className={`flex ${opacityClass} ${
                      message.type === 'student' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.type === 'student' ? (
                      <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground max-w-[80%]">
                        <p className="text-sm break-words overflow-wrap-anywhere">
                          {message.content}
                        </p>
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-neutral max-w-[85%] break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {normalizeLatexDelimiters(message.content)}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          })()}

          {/* Streaming / thinking states */}
          {isSending && (
            <div className="flex justify-start">
              {streamingMessage ? (
                <div className="prose prose-sm prose-neutral max-w-[85%] break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {streamingMessage}
                  </ReactMarkdown>
                </div>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
              )}
            </div>
          )}

          {voiceTranscript && (
            <div className="flex justify-end">
              <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground max-w-[80%]">
                <p className="text-sm break-words overflow-wrap-anywhere">{voiceTranscript}</p>
              </div>
            </div>
          )}

          {isAssistantThinking && !assistantStreamingText && (
            <div className="flex justify-start">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
            </div>
          )}

          {assistantStreamingText && (
            <div className="flex justify-start">
              <div className="prose prose-sm prose-neutral max-w-[85%] break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {assistantStreamingText}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area — suggestions above, then unified card with references + input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        {isSessionComplete ? (
          <div className="text-center text-muted-foreground py-2">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-sm">{t.tutor.sessionComplete}</p>
          </div>
        ) : (
          <>
            {/* Suggestion pills — outside and above the card */}
            {(isSuggestionsLoading || suggestions.length > 0) && !isSending && (
              <div className="flex flex-wrap gap-2 mb-1.5 px-1">
                {isSuggestionsLoading && suggestions.length === 0
                  ? [1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="h-7 rounded-full bg-muted animate-pulse"
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

          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            {/* References panel — fused to the top of the input card */}
            {artifacts.length > 0 && (
              <>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                  onClick={() => setArtifactsPanelOpen(v => !v)}
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
                    References ({artifacts.length})
                  </span>
                  {artifactsPanelOpen
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  }
                </button>
                {artifactsPanelOpen && (
                  <div>
                    <ScrollArea orientation="horizontal">
                      <div className="flex gap-3 p-3">
                        {artifacts.map((art) => {
                          const isHighlighted = art.id === activeHighlightId
                          const isExpanded = expandedArtifactIds.has(art.id)
                          return (
                            <div
                              key={art.id}
                              className={`flex-shrink-0 rounded-md border text-sm transition-colors ${
                                isHighlighted
                                  ? 'border-green-500/40 bg-green-50 ring-1 ring-green-500/20'
                                  : 'border-border bg-muted/30'
                              } ${isExpanded ? 'w-96' : 'w-auto'}`}
                            >
                              <button
                                type="button"
                                className="flex items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/50 rounded-md transition-colors w-full"
                                onClick={() => setExpandedArtifactIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(art.id)) next.delete(art.id)
                                  else next.add(art.id)
                                  return next
                                })}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                  : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                }
                                <span className={`font-medium whitespace-nowrap ${isHighlighted ? 'text-green-700' : ''}`}>
                                  {art.label}
                                </span>
                              </button>
                              {isExpanded && (
                                <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: '40vh' }}>
                                  <div className="prose prose-sm prose-neutral max-w-none">
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
              </>
            )}
            <ChatInput
              noCard
              onSend={(message) => onSendMessage(message)}
              placeholder={`${t.tutor.responsePlaceholder} (Enter to send)`}
              disabled={isSending}
              sessionId={sessionId}
              isRecording={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              voiceStatus={isRecording ? 'Recording...' : voiceTranscript || undefined}
            />
          </div>
          </>
        )}
      </div>
    </div>
  )
}
