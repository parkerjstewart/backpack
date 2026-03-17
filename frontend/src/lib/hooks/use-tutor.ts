'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorKey } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { tutorApi } from '@/lib/api/tutor'
import {
  TutorSessionResponse,
  TutorResponsePayload,
  TutorDebugInfo,
  Artifact,
} from '@/lib/types/api'

interface Message {
  id: string
  type: 'tutor' | 'student'
  content: string
  artifact_content?: string | null
  highlighted_artifact_id?: string | null
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
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState('')

  // Ref guard to prevent concurrent sends — React state updates are async so
  // isSending alone cannot block a second call before the first re-render.
  const isSendingRef = useRef(false)

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
      setArtifacts(session.artifacts ?? [])
      // Add the first tutor message
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        type: 'tutor',
        content: session.first_message,
        image_url: session.first_image_url,
        highlighted_artifact_id: session.highlighted_artifact_id ?? null,
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
    } catch {
      // Error already surfaced by mutation's onError handler (toast)
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
    setArtifacts([])
    setSuggestions([])
    setStreamingMessage('')
  }, [])

  // Fetch suggestions whenever the last message is from the tutor and we're idle.
  // This covers session init, text turns, and voice turns in one place.
  useEffect(() => {
    if (!sessionId || isSending || isInitializing) return
    if (sessionPhase === 'session_complete') return
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.type !== 'tutor') return

    let mounted = true
    const controller = new AbortController()
    const last4 = messages.slice(-4).map(m => ({
      role: m.type === 'tutor' ? 'tutor' : 'student',
      content: m.content,
    }))
    setIsSuggestionsLoading(true)
    tutorApi.getSuggestions(sessionId, last4, controller.signal)
      .then(result => { if (mounted) setSuggestions(result) })
      .catch((err) => {
        if (mounted && err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
          setSuggestions([])
        }
      })
      .finally(() => { if (mounted) setIsSuggestionsLoading(false) })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [messages, sessionId, isSending, isInitializing, sessionPhase])

  // Send response to tutor using streaming SSE.
  // When attachDrawing=true, the current canvas state is exported as a PNG
  // and sent alongside the text so the model can see what the student drew.
  const sendMessage = useCallback(async (message: string, attachDrawing = false) => {
    if (!sessionId) {
      toast.error('No active session')
      return
    }
    if (isSendingRef.current) return
    isSendingRef.current = true

    // Clear suggestions immediately when student sends
    setSuggestions([])

    // Add student message optimistically
    const studentMessage: Message = {
      id: `student-${Date.now()}`,
      type: 'student',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, studentMessage])
    setIsSending(true)
    setStreamingMessage('')

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
      let finalPayload: TutorResponsePayload | null = null

      for await (const event of tutorApi.streamResponse(sessionId, message, whiteboardPng)) {
        if (event.type === 'token') {
          setStreamingMessage(prev => prev + event.text)
        } else if (event.type === 'complete') {
          finalPayload = event as TutorResponsePayload
        } else if (event.type === 'error') {
          throw new Error(event.message)
        }
      }

      if (!finalPayload) {
        throw new Error('Stream ended without a complete event')
      }

      // Commit the final message to the conversation
      const tutorMessage: Message = {
        id: `tutor-${Date.now()}`,
        type: 'tutor',
        content: finalPayload.tutor_message,
        artifact_content: finalPayload.artifact_content ?? null,
        highlighted_artifact_id: finalPayload.highlighted_artifact_id ?? null,
        image_url: finalPayload.tutor_image_url,
        timestamp: new Date().toISOString(),
      }
      setStreamingMessage('')
      setArtifacts(finalPayload.artifacts ?? [])
      setMessages(prev => [...prev, tutorMessage])

      // Fire-and-forget: fetch debug state after each exchange
      tutorApi.getDebugState(sessionId).then(setLatestDebugInfo).catch(() => {})

      // Update session state
      setSessionPhase(finalPayload.phase)
      setCurrentGoal(finalPayload.current_goal_description)
      setGoalsCompleted(finalPayload.goals_completed)
      setGoalsRemaining(finalPayload.goals_remaining)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }, message?: string }
      console.error('Error sending response:', error)
      setStreamingMessage('')
      toast.error(t(getApiErrorKey(error.response?.data?.detail || error.message, 'apiErrors.failedToSendMessage')))
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== studentMessage.id))
    } finally {
      isSendingRef.current = false
      setIsSending(false)
    }
  }, [sessionId, t])

  const appendVoiceTurn = useCallback((
    studentText: string,
    tutorText: string,
    artifactContent?: string | null,
    imageUrl?: string | null,
    newArtifacts?: Artifact[],
    highlightedArtifactId?: string | null,
  ) => {
    setSuggestions([])
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
      artifact_content: artifactContent ?? null,
      highlighted_artifact_id: highlightedArtifactId ?? null,
      image_url: imageUrl ?? null,
      timestamp: new Date().toISOString(),
    }
    if (newArtifacts) {
      setArtifacts(newArtifacts)
    }
    setMessages(prev => [...prev, studentMessage, tutorMessage])
  }, [])

  return {
    // State
    sessionId,
    messages,
    artifacts,
    isSending,
    isInitializing,
    sessionPhase,
    currentGoal,
    goalsCompleted,
    goalsRemaining,
    isSessionComplete: sessionPhase === 'session_complete',
    latestDebugInfo,
    streamingMessage,

    // Canvas export function setter (ref-based — updates don't cause re-renders)
    setExportCanvas,
    getWhiteboardPng,

    // Quick reply suggestions
    suggestions,
    isSuggestionsLoading,

    // Actions
    initializeSession,
    sendMessage,
    resetSession,
    appendVoiceTurn,
  }
}
