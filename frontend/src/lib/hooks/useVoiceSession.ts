'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Artifact, VoiceContextPayload, VoiceServerEvent } from '@/lib/types/api'

interface UseVoiceSessionParams {
  getContextPayload: () => Promise<VoiceContextPayload | null>
  getWhiteboardPng?: () => Promise<string | null>
  onFinalTranscript: (text: string) => void
  onAssistantTextDelta?: (text: string) => void
  onAssistantTextFinal: (text: string, artifactContent?: string | null, imageUrl?: string | null, artifacts?: Artifact[], highlightedArtifactId?: string | null) => void
  onError?: (message: string) => void
}

interface AudioClip {
  mimeType: string
  bytes: Uint8Array
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const preferred = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  for (const mime of preferred) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime
      }
    } catch {
      continue
    }
  }
  return undefined
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const authStorage = localStorage.getItem('auth-storage')
    if (!authStorage) return null
    const parsed = JSON.parse(authStorage)
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function useVoiceSession({
  getContextPayload,
  getWhiteboardPng,
  onFinalTranscript,
  onAssistantTextDelta,
  onAssistantTextFinal,
  onError,
}: UseVoiceSessionParams) {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAssistantThinking, setIsAssistantThinking] = useState(false)
  const [assistantStreamingText, setAssistantStreamingText] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const isPlayingRef = useRef(false)
  const audioQueueRef = useRef<AudioClip[]>([])
  const pendingAudioChunksRef = useRef<Uint8Array[]>([])
  const pendingAudioMimeTypeRef = useRef('audio/mpeg')
  const audioContextRef = useRef<AudioContext | null>(null)

  const concatUint8Arrays = useCallback((chunks: Uint8Array[]): Uint8Array => {
    if (chunks.length === 0) return new Uint8Array()
    if (chunks.length === 1) return chunks[0]
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    return combined
  }, [])

  const drainAudioQueue = useCallback(() => {
    if (isPlayingRef.current) return
    const next = audioQueueRef.current.shift()
    if (!next) return

    const ctx = audioContextRef.current
    if (!ctx) return

    isPlayingRef.current = true
    // Copy the buffer before passing to decodeAudioData — some browsers detach it
    ctx.decodeAudioData(
      next.bytes.buffer.slice(0) as ArrayBuffer,
      (buffer) => {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = () => {
          isPlayingRef.current = false
          drainAudioQueue()
        }
        source.start(0)
      },
      () => {
        isPlayingRef.current = false
        drainAudioQueue()
      },
    )
  }, [])

  const sendEvent = useCallback((type: string, payload?: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type, payload }))
  }, [])

  const ensureConnected = useCallback(async () => {
    const existing = wsRef.current
    if (existing) {
      if (existing.readyState === WebSocket.OPEN) return
      // Close any stale socket (CONNECTING, CLOSING, or CLOSED) before reconnecting.
      // Null out onclose first so the handler doesn't fire and overwrite wsRef mid-setup.
      existing.onclose = null
      existing.close()
      wsRef.current = null
    }

    const token = getAuthToken()
    if (!token) {
      throw new Error('Authentication required for voice chat')
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/voice/realtime?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    await Promise.race([
      new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          setIsConnected(true)
          resolve()
        }
        ws.onerror = () => reject(new Error('Unable to connect voice socket'))
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          ws.close()
          reject(new Error('Voice connection timed out'))
        }, 10_000)
      ),
    ])

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
    }
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as VoiceServerEvent
        if (data.type === 'final_transcript') {
          const text = String(data.payload?.text ?? '')
          onFinalTranscript(text)
        } else if (data.type === 'assistant_thinking') {
          const status = String(data.payload?.status ?? '').toLowerCase()
          setIsAssistantThinking(status === 'start')
        } else if (data.type === 'assistant_text_delta') {
          const delta = String(data.payload?.text ?? '')
          setIsAssistantThinking(false)
          setAssistantStreamingText((prev) => `${prev}${delta}`)
          onAssistantTextDelta?.(delta)
        } else if (data.type === 'assistant_text_final') {
          const text = String(data.payload?.text ?? '')
          // Support both new 'artifact_content' and legacy 'supplement' from voice backend
          const artifactContent = data.payload?.artifact_content
            ? String(data.payload.artifact_content)
            : data.payload?.supplement
              ? String(data.payload.supplement)
              : null
          const imageUrl = data.payload?.image_url ? String(data.payload.image_url) : null
          const artifacts = Array.isArray(data.payload?.artifacts) ? (data.payload.artifacts as Artifact[]) : undefined
          const highlightedArtifactId = data.payload?.highlighted_artifact_id ? String(data.payload.highlighted_artifact_id) : null
          setIsAssistantThinking(false)
          setAssistantStreamingText('')
          onAssistantTextFinal(text, artifactContent, imageUrl, artifacts, highlightedArtifactId)
        } else if (data.type === 'assistant_audio_chunk') {
          const encoded = String(data.payload?.audio_base64 ?? '')
          if (encoded) {
            pendingAudioMimeTypeRef.current = String(data.payload?.mime_type ?? 'audio/mpeg')
            pendingAudioChunksRef.current.push(decodeBase64(encoded))
          }
        } else if (data.type === 'assistant_audio_end') {
          if (pendingAudioChunksRef.current.length > 0) {
            const merged = concatUint8Arrays(pendingAudioChunksRef.current)
            pendingAudioChunksRef.current = []
            audioQueueRef.current.push({
              mimeType: pendingAudioMimeTypeRef.current,
              bytes: merged,
            })
            drainAudioQueue()
          }
        } else if (data.type === 'error') {
          setIsAssistantThinking(false)
          pendingAudioChunksRef.current = []
          const message = String(data.payload?.message ?? 'Voice error')
          onError?.(message)
        }
      } catch {
        onError?.('Failed to parse voice event')
      }
    }
  }, [drainAudioQueue, onAssistantTextDelta, onAssistantTextFinal, onError, onFinalTranscript])

  const startRecording = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone is not available in this browser')
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser')
      }
      // Create/resume AudioContext inside the user gesture so playback is unlocked
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      } else if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      await ensureConnected()
      const context = await getContextPayload()
      if (!context) {
        throw new Error('Voice context unavailable')
      }
      sendEvent('context', context as unknown as Record<string, unknown>)
      sendEvent('start_turn')
      setIsAssistantThinking(false)
      setAssistantStreamingText('')
      pendingAudioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickRecorderMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      recordedChunksRef.current = []
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          recordedChunksRef.current.push(evt.data)
        }
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (error) {
      onError?.((error as Error).message || 'Unable to start recording')
    }
  }, [ensureConnected, getContextPayload, onError, sendEvent])

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    // Capture whiteboard PNG before stopping (while user gesture is still active)
    let whiteboardPng: string | null = null
    if (getWhiteboardPng) {
      try {
        whiteboardPng = await getWhiteboardPng()
      } catch {
        // Non-fatal — proceed without image
      }
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          const audioBase64 = await blobToBase64(blob)
          sendEvent('audio_chunk', {
            audio_base64: audioBase64,
            mime_type: blob.type || 'audio/webm',
          })
          const endTurnPayload: Record<string, unknown> = {}
          if (whiteboardPng) endTurnPayload.whiteboard_png = whiteboardPng
          sendEvent('end_turn', endTurnPayload)
        } catch (error) {
          onError?.((error as Error).message || 'Unable to process recording')
        } finally {
          recorder.stream.getTracks().forEach((track) => track.stop())
          mediaRecorderRef.current = null
          setIsRecording(false)
          resolve()
        }
      }
      recorder.stop()
    })
  }, [getWhiteboardPng, onError, sendEvent])

  const cancelTurn = useCallback(() => {
    sendEvent('cancel_turn')
    setAssistantStreamingText('')
  }, [sendEvent])

  useEffect(() => {
    return () => {
      const ws = wsRef.current
      if (ws) {
        ws.close()
      }
      pendingAudioChunksRef.current = []
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      audioContextRef.current?.close()
      setIsAssistantThinking(false)
    }
  }, [concatUint8Arrays, drainAudioQueue])

  return {
    isConnected,
    isRecording,
    isAssistantThinking,
    assistantStreamingText,
    startRecording,
    stopRecording,
    cancelTurn,
  }
}
