'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Send, Loader2, X } from 'lucide-react'
import { useModuleRefine } from '@/lib/hooks/use-module-refine'
import { LearningGoalPreview } from '@/lib/types/api'
import { cn } from '@/lib/utils'

interface RefinementChatProps {
  currentOverview: string
  currentGoals: LearningGoalPreview[]
  onApplyChanges: (overview: string, goals: LearningGoalPreview[]) => void
  moduleId?: string
  sourceIds?: string[]
}

export function RefinementChat({
  currentOverview,
  currentGoals,
  onApplyChanges,
  moduleId,
  sourceIds,
}: RefinementChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, sendMessage, clearMessages, isPending } = useModuleRefine({
    moduleId,
    sourceIds,
  })

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isPending) return

    setInput('')
    try {
      const result = await sendMessage(text, currentOverview, currentGoals)
      onApplyChanges(result.overview, result.learning_goals)
    } catch {
      // Error is handled by the mutation - user sees the message stay
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    clearMessages()
  }

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        Refine with AI
      </Button>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium">Refine with AI</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="h-7 w-7 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="max-h-[240px] overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Describe how you&apos;d like to change the overview or learning goals.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'text-sm rounded-lg px-3 py-2',
              msg.role === 'user'
                ? 'bg-primary/10 ml-8'
                : 'bg-muted mr-8'
            )}
          >
            {msg.content}
          </div>
        ))}
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-8 bg-muted rounded-lg px-3 py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Applying changes...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g., "Make the overview shorter" or "Add a goal about data pipelines"'
          className="min-h-[60px] max-h-[100px] resize-none text-sm"
          disabled={isPending}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || isPending}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
