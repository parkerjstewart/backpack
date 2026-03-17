'use client'

import { useState, useRef, useEffect } from 'react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Target, CheckCircle2 } from 'lucide-react'
import { TutorLoadingAnimation } from './TutorLoadingAnimation'
import { ChatInput } from '@/components/common/ChatInput'
import { MathMarkdown } from '@/components/ui/math-markdown'
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
  // Determine which artifact is highlighted by the most recent tutor message
  const lastTutorMessage = [...messages].reverse().find(m => m.type === 'tutor')
  const activeHighlightId = lastTutorMessage?.highlighted_artifact_id ?? null

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
          <div className="mx-auto w-fit"><TutorLoadingAnimation size="lg" isLoading /></div>
          <p className="text-muted-foreground">{t.tutor.initializing}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full flex-1 overflow-hidden ${className ?? ''}`}>
      {/* Goal / progress header — no card chrome */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
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
        <div className="space-y-4 pt-1 pb-24">
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
                        <MathMarkdown>{message.content}</MathMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          })()}

          {/* Streaming text (typed response) */}
          {isSending && streamingMessage && (
            <div className="flex justify-start">
              <div className="prose prose-sm prose-neutral max-w-[85%] break-words">
                <MathMarkdown>{streamingMessage}</MathMarkdown>
              </div>
            </div>
          )}

          {voiceTranscript && (
            <div className="flex justify-end">
              <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground max-w-[80%]">
                <p className="text-sm break-words overflow-wrap-anywhere">{voiceTranscript}</p>
              </div>
            </div>
          )}

          {/* Streaming text (voice response) */}
          {assistantStreamingText && (
            <div className="flex justify-start">
              <div className="prose prose-sm prose-neutral max-w-[85%] break-words">
                <MathMarkdown>{assistantStreamingText}</MathMarkdown>
              </div>
            </div>
          )}

          {/* Tutor presence dot — always visible, uncurls when thinking */}
          {!isSessionComplete && !streamingMessage && !assistantStreamingText && (
            <div className="flex justify-start">
              <TutorLoadingAnimation
                size="sm"
                isLoading={(isSending && !streamingMessage) || (isAssistantThinking && !assistantStreamingText)}
              />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area — suggestions above, then unified card with references + input */}
      <div className="flex-shrink-0 px-4 pb-4">
        {isSessionComplete ? (
          <div className="text-center text-muted-foreground py-2">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
            <p className="text-sm">{t.tutor.sessionComplete}</p>
          </div>
        ) : (
          <>
            {/* Suggestion pills — outside and above the card */}
            {(isSuggestionsLoading || suggestions.length > 0) && !isSending && (
              <div className="flex flex-wrap gap-2 mt-3 mb-3 px-1">
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
            {/* Artifact cards — always shown when artifacts exist */}
            {artifacts.length > 0 && (
              <ScrollArea>
                <div className="flex gap-3 px-4 pt-3 pb-3">
                      {artifacts.map((art) => {
                        const isHighlighted = art.id === activeHighlightId
                        return (
                          <div key={art.id} className="flex-shrink-0 flex flex-col gap-1">
                            <p className="text-sm font-medium text-foreground px-0.5 whitespace-nowrap">
                              {art.label}
                            </p>
                            <div
                              className={`rounded-md text-sm px-4 py-3 transition-colors ${
                                isHighlighted ? 'bg-accent/40' : 'bg-secondary'
                              }`}
                            >
                              <div className="prose prose-sm prose-neutral max-w-none overflow-y-auto" style={{ maxHeight: '40vh' }}>
                                <MathMarkdown>{art.content}</MathMarkdown>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
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

