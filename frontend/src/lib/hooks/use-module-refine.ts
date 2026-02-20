import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { modulesApi } from '@/lib/api/modules'
import {
  RefineContentMessage,
  RefineContentRequest,
  LearningGoalPreview,
} from '@/lib/types/api'

interface UseModuleRefineOptions {
  moduleId?: string
  sourceIds?: string[]
}

export function useModuleRefine({ moduleId, sourceIds }: UseModuleRefineOptions) {
  const [messages, setMessages] = useState<RefineContentMessage[]>([])

  const mutation = useMutation({
    mutationFn: (request: RefineContentRequest) => modulesApi.refineContent(request),
  })

  const sendMessage = useCallback(
    async (
      text: string,
      currentOverview: string,
      currentGoals: LearningGoalPreview[]
    ) => {
      // Add user message to history
      const userMessage: RefineContentMessage = { role: 'user', content: text }
      const updatedHistory = [...messages, userMessage]
      setMessages(updatedHistory)

      const request: RefineContentRequest = {
        overview: currentOverview,
        learning_goals: currentGoals,
        message: text,
        message_history: messages, // Send previous history (not including current message)
        module_id: moduleId,
        source_ids: sourceIds,
      }

      const result = await mutation.mutateAsync(request)

      // Add assistant response to history
      const assistantMessage: RefineContentMessage = {
        role: 'assistant',
        content: result.explanation,
      }
      setMessages((prev) => [...prev, assistantMessage])

      return result
    },
    [messages, moduleId, sourceIds, mutation]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    sendMessage,
    clearMessages,
    isPending: mutation.isPending,
  }
}
