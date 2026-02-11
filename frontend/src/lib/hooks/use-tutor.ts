'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { tutorApi } from '@/lib/api/tutor'
import {
  TutorSessionResponse,
  TutorResponsePayload,
} from '@/lib/types/api'

interface Message {
  id: string
  type: 'tutor' | 'student'
  content: string
  timestamp: string
}

interface UseTutorParams {
  moduleId: string
}

export function useTutor({ moduleId }: UseTutorParams) {
  const { t } = useTranslation()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isSending, setIsSending] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [sessionPhase, setSessionPhase] = useState<'in_progress' | 'goal_complete' | 'session_complete'>('in_progress')
  const [currentGoal, setCurrentGoal] = useState<string | null>(null)
  const [goalsCompleted, setGoalsCompleted] = useState(0)
  const [goalsRemaining, setGoalsRemaining] = useState(0)

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: () => tutorApi.createSession(moduleId),
    onSuccess: (session: TutorSessionResponse) => {
      setSessionId(session.session_id)
      setCurrentGoal(session.current_goal_description)
      setGoalsRemaining(session.total_goals)
      // Add the first tutor message
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        type: 'tutor',
        content: session.first_message,
        timestamp: new Date().toISOString(),
      }
      setMessages([tutorMessage])
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string }
      toast.error(t(getApiErrorKey(error.response?.data?.detail || error.message, 'apiErrors.failedToCreateSession')))
    },
  })

  // Initialize session
  const initializeSession = useCallback(async () => {
    setIsInitializing(true)
    try {
      await createSessionMutation.mutateAsync()
    } finally {
      setIsInitializing(false)
    }
  }, [createSessionMutation])

  // Send response to tutor
  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId) {
      toast.error('No active session')
      return
    }

    // Add student message optimistically
    const studentMessage: Message = {
      id: `student-${Date.now()}`,
      type: 'student',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, studentMessage])
    setIsSending(true)

    try {
      const response: TutorResponsePayload = await tutorApi.sendResponse(sessionId, message)

      // Add tutor response
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        type: 'tutor',
        content: response.tutor_message,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, tutorMessage])

      // Update session state
      setSessionPhase(response.phase)
      setCurrentGoal(response.current_goal_description)
      setGoalsCompleted(response.goals_completed)
      setGoalsRemaining(response.goals_remaining)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }, message?: string }
      console.error('Error sending response:', error)
      toast.error(t(getApiErrorKey(error.response?.data?.detail || error.message, 'apiErrors.failedToSendMessage')))
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== studentMessage.id))
    } finally {
      setIsSending(false)
    }
  }, [sessionId, t])

  return {
    // State
    sessionId,
    messages,
    isSending,
    isInitializing,
    sessionPhase,
    currentGoal,
    goalsCompleted,
    goalsRemaining,
    isSessionComplete: sessionPhase === 'session_complete',

    // Actions
    initializeSession,
    sendMessage,
  }
}
