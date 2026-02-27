'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { tutorApi } from '@/lib/api/tutor'
import {
  TutorSessionResponse,
  TutorResponsePayload,
  TutorDebugInfo,
} from '@/lib/types/api'

interface Message {
  id: string
  type: 'tutor' | 'student'
  content: string
  supplement?: string | null
  image_url?: string | null
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
  const [latestDebugInfo, setLatestDebugInfo] = useState<TutorDebugInfo | null>(null)

  // Holds the async PNG export function provided by ExcalidrawCanvas.
  // Using a ref avoids re-renders while still being accessible in sendMessage.
  const exportCanvasRef = useRef<(() => Promise<string | null>) | null>(null)
  const setExportCanvas = useCallback((fn: () => Promise<string | null>) => {
    exportCanvasRef.current = fn
  }, [])

  const getWhiteboardPng = useCallback(async (): Promise<string | null> => {
    if (!exportCanvasRef.current) return null
    try {
      return await exportCanvasRef.current()
    } catch {
      return null
    }
  }, [])

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
        supplement: session.first_supplement,
        image_url: session.first_image_url,
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

  // Reset session state so a new session can be started
  const resetSession = useCallback(() => {
    setSessionId(null)
    setMessages([])
    setIsSending(false)
    setIsInitializing(false)
    setSessionPhase('in_progress')
    setCurrentGoal(null)
    setGoalsCompleted(0)
    setGoalsRemaining(0)
    setLatestDebugInfo(null)
  }, [])

  // Send response to tutor.
  // When attachDrawing=true, the current canvas state is exported as a PNG
  // and sent alongside the text so the model can see what the student drew.
  const sendMessage = useCallback(async (message: string, attachDrawing = false) => {
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

    // Export canvas as PNG data URL if attachment was requested
    let whiteboardPng: string | undefined = undefined
    if (attachDrawing && exportCanvasRef.current) {
      try {
        whiteboardPng = (await exportCanvasRef.current()) ?? undefined
      } catch {
        // Non-fatal — proceed without the image
      }
    }

    try {
      const response: TutorResponsePayload = await tutorApi.sendResponse(sessionId, message, whiteboardPng)

      // Add tutor response
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        type: 'tutor',
        content: response.tutor_message,
        supplement: response.tutor_supplement,
        image_url: response.tutor_image_url,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, tutorMessage])

      // Fire-and-forget: fetch debug state after each exchange
      tutorApi.getDebugState(sessionId).then(setLatestDebugInfo).catch(() => {})

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

  const appendVoiceTurn = useCallback((studentText: string, tutorText: string, supplement?: string | null, imageUrl?: string | null) => {
    const studentMessage: Message = {
      id: `student-${Date.now()}`,
      type: 'student',
      content: studentText,
      timestamp: new Date().toISOString(),
    }
    const tutorMessage: Message = {
      id: `tutor-${Date.now()}-${Math.random()}`,
      type: 'tutor',
      content: tutorText,
      supplement: supplement ?? null,
      image_url: imageUrl ?? null,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, studentMessage, tutorMessage])
  }, [])

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
    latestDebugInfo,

    // Canvas export function setter (ref-based — updates don't cause re-renders)
    setExportCanvas,
    getWhiteboardPng,

    // Actions
    initializeSession,
    sendMessage,
    resetSession,
    appendVoiceTurn,
  }
}
