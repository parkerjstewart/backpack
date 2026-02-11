'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, User, Send, Loader2, Target, CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from '@/lib/hooks/use-translation'

interface Message {
  id: string
  type: 'tutor' | 'student'
  content: string
  timestamp: string
}

interface TutorChatProps {
  messages: Message[]
  isSending: boolean
  isInitializing: boolean
  onSendMessage: (message: string) => void
  currentGoal: string | null
  goalsCompleted: number
  goalsRemaining: number
  isSessionComplete: boolean
  moduleName?: string
}

export function TutorChat({
  messages,
  isSending,
  isInitializing,
  onSendMessage,
  currentGoal,
  goalsCompleted,
  goalsRemaining,
  isSessionComplete,
  moduleName,
}: TutorChatProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [input, setInput] = useState('')
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (input.trim() && !isSending && !isSessionComplete) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey

    if (e.key === 'Enter' && isModifierPressed) {
      e.preventDefault()
      handleSend()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
  const keyHint = isMac ? '⌘+Enter' : 'Ctrl+Enter'

  if (isInitializing) {
    return (
      <Card className="flex flex-col h-full flex-1 overflow-hidden">
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
    <Card className="flex flex-col h-full flex-1 overflow-hidden">
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

      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
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
                        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
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
                <div className="rounded-lg px-4 py-2 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
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
            <div className="flex gap-2 items-end">
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
          )}
        </div>
      </CardContent>
    </Card>
  )
}
