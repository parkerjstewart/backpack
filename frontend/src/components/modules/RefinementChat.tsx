'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowUp, Loader2, Sparkles } from 'lucide-react'
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
  const [input, setInput] = useState('')

  const { sendMessage, isPending } = useModuleRefine({ moduleId, sourceIds })

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isPending) return

    setInput('')
    try {
      const result = await sendMessage(text, currentOverview, currentGoals)
      onApplyChanges(result.overview, result.learning_goals)
    } catch {
      // Error handled by mutation
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={cn(
      'border rounded-md p-4 flex flex-col gap-3 overflow-hidden',
      isPending ? 'animate-border-pulse' : 'border-border'
    )}>
      <div className="flex items-center gap-1.5 text-lg font-medium text-foreground">
        <Sparkles className="size-3.5" />
        Refine with AI
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g., "Make the overview shorter" or "Add a goal about data pipelines"'
          disabled={isPending}
          className="flex-1"
        />
        <Button
          variant="default"
          size="icon-circle"
          onClick={handleSend}
          disabled={!input.trim() || isPending}
          aria-label="Send"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
