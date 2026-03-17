import apiClient from './client'
import { getApiUrl } from '@/lib/config'
import {
  TutorSessionResponse,
  TutorResponsePayload,
  TutorSessionStateResponse,
  TutorDebugInfo,
} from '@/lib/types/api'

export type TutorStreamEvent =
  | { type: 'token'; text: string }
  | ({ type: 'complete' } & TutorResponsePayload)
  | { type: 'error'; message: string }

function getAuthHeader(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('auth-storage')
    if (!raw) return null
    const { state } = JSON.parse(raw)
    return state?.token ? `Bearer ${state.token}` : null
  } catch {
    return null
  }
}

export const tutorApi = {
  // Create a new tutor session for a module
  createSession: async (moduleId: string) => {
    const response = await apiClient.post<TutorSessionResponse>(
      `/tutor/sessions`,
      { module_id: moduleId }
    )
    return response.data
  },

  // Get current session state
  getSession: async (sessionId: string) => {
    const response = await apiClient.get<TutorSessionStateResponse>(
      `/tutor/sessions/${sessionId}`
    )
    return response.data
  },

  // Send student response and get tutor reply.
  // whiteboardPng is an optional base64 PNG data URL exported from the Excalidraw canvas.
  sendResponse: async (sessionId: string, message: string, whiteboardPng?: string) => {
    const response = await apiClient.post<TutorResponsePayload>(
      `/tutor/sessions/${sessionId}/respond`,
      { message, whiteboard_png: whiteboardPng ?? null }
    )
    return response.data
  },

  // Stream student response — yields token events then a final complete event.
  streamResponse: async function* (
    sessionId: string,
    message: string,
    whiteboardPng?: string
  ): AsyncGenerator<TutorStreamEvent> {
    const apiUrl = await getApiUrl()
    const auth = getAuthHeader()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth) headers['Authorization'] = auth

    const response = await fetch(
      `${apiUrl}/api/tutor/sessions/${sessionId}/respond/stream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, whiteboard_png: whiteboardPng ?? null }),
      }
    )

    if (!response.ok || !response.body) {
      yield { type: 'error', message: `Request failed: ${response.status}` }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // Flush any bytes still held inside the decoder (e.g. incomplete UTF-8 sequences)
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6)) as TutorStreamEvent
          } catch {
            // skip malformed event
          }
        }
      }
    }
    // Process anything left in the buffer after the stream closes
    if (buffer.trim().startsWith('data: ')) {
      try {
        yield JSON.parse(buffer.trim().slice(6)) as TutorStreamEvent
      } catch {
        // skip malformed trailing event
      }
    }
  },

  // Get internal agent debug state (tutor mode, student model, hypotheses, etc.)
  getDebugState: async (sessionId: string) => {
    const response = await apiClient.get<TutorDebugInfo>(
      `/tutor/sessions/${sessionId}/debug`
    )
    return response.data
  },

  // Generate quick reply suggestions based on recent conversation messages.
  getSuggestions: async (sessionId: string, messages: { role: string; content: string }[], signal?: AbortSignal) => {
    const response = await apiClient.post<{ suggestions: string[] }>(
      `/tutor/sessions/${sessionId}/suggestions`,
      { messages },
      { signal }
    )
    return response.data.suggestions
  },
}

export default tutorApi
