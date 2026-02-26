'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'

// Load exportToBlob once on the client side (it's not available server-side)
let _exportToBlob: typeof import('@excalidraw/excalidraw').exportToBlob | null = null
if (typeof window !== 'undefined') {
  import('@excalidraw/excalidraw').then(mod => { _exportToBlob = mod.exportToBlob })
}

// Lazy-load the Excalidraw component — it's browser-only
const Excalidraw = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw')
    return mod.Excalidraw
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading canvas...
      </div>
    ),
  }
)

interface ExcalidrawCanvasProps {
  // Called whenever the canvas is ready or elements change.
  // The parent stores this function and calls it when it wants to export the PNG.
  onExportReady: (exportFn: () => Promise<string | null>) => void
  className?: string
}

export function ExcalidrawCanvas({ onExportReady, className }: ExcalidrawCanvasProps) {
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [excalidrawReady, setExcalidrawReady] = useState(false)

  // Guard against SSR
  useEffect(() => { setMounted(true) }, [])

  // Once the Excalidraw API is available:
  // 1. Trigger a layout refresh after 50ms so dimensions are correct
  // 2. Register the export function with the parent
  useEffect(() => {
    if (!excalidrawReady) return

    const timer = setTimeout(() => {
      excalidrawAPI.current?.refresh()
    }, 50)

    const exportFn = async (): Promise<string | null> => {
      const api = excalidrawAPI.current
      if (!api || !_exportToBlob) return null
      const elements = api.getSceneElements()
      if (!elements || elements.length === 0) return null
      try {
        const blob = await _exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true },
          files: api.getFiles(),
          exportPadding: 16,
          maxWidthOrHeight: 1024,
        })
        return await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
      } catch {
        return null
      }
    }

    onExportReady(exportFn)

    return () => clearTimeout(timer)
  }, [excalidrawReady, onExportReady])

  // Watch container size and call refresh() so Excalidraw reads actual dimensions
  useEffect(() => {
    if (!mounted) return
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      excalidrawAPI.current?.refresh()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [mounted])

  if (!mounted) {
    return (
      <div className={`flex items-center justify-center text-muted-foreground text-sm ${className ?? ''}`}>
        Loading canvas...
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      <Excalidraw
        excalidrawAPI={(api) => {
          excalidrawAPI.current = api
          setExcalidrawReady(true)
        }}
        initialData={{
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' },
        }}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            export: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  )
}
