'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TutorChat } from '@/components/tutor/TutorChat'
import { TutorDebugPanel } from '@/components/tutor/TutorDebugPanel'
import { ExcalidrawCanvas } from '@/components/tutor/ExcalidrawCanvas'
import { useTutor } from '@/lib/hooks/use-tutor'
import { useModule } from '@/lib/hooks/use-modules'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Bug, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function ReviewPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()

  const moduleId = params?.id ? decodeURIComponent(params.id as string) : ''
  const hasInitializedRef = useRef(false)

  const { data: module, isLoading: moduleLoading } = useModule(moduleId)

  const [showDebug, setShowDebug] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)

  // Resizable chat panel width
  const [chatWidth, setChatWidth] = useState(420)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    e.preventDefault()
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(280, Math.min(e.clientX - rect.left, rect.width - 300))
      setChatWidth(newWidth)
    }
    const handleMouseUp = () => { isDraggingRef.current = false }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const {
    sessionId,
    messages,
    artifacts,
    isSending,
    isInitializing,
    currentGoal,
    goalsCompleted,
    goalsRemaining,
    isSessionComplete,
    latestDebugInfo,
    setExportCanvas,
    getWhiteboardPng,
    suggestions,
    isSuggestionsLoading,
    streamingMessage,
    initializeSession,
    sendMessage,
    resetSession,
    appendVoiceTurn,
  } = useTutor({ moduleId })

  // Initialize the tutor session once when the page loads.
  // Guard with a ref to prevent double-initialization: initializeSession changes
  // reference on every render (because useMutation returns a new object each render),
  // which would cause this effect to re-run and create a second session.
  useEffect(() => {
    if (moduleId && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      initializeSession()
    }
  }, [moduleId, initializeSession])

  const handleTryAgain = useCallback(() => {
    resetSession()
  }, [resetSession])

  if (moduleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!module) {
    return (
      <AppShell>
        <div className="container mx-auto py-8 text-center">
          <h1 className="text-2xl font-bold mb-4">{t.common.notFound}</h1>
          <Button variant="outline" onClick={() => router.push('/modules')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.common.back}
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t.common.back}
              </Button>
              <h1 className="text-xl font-semibold">
                {t.tutor.reviewSession}: {module.name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTryAgain}
                disabled={isInitializing || isSending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t.tutor.tryAgain}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCanvas(v => !v)}
                title={showCanvas ? 'Hide whiteboard' : 'Show whiteboard'}
              >
                {showCanvas ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant={showDebug ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowDebug(v => !v)}
                title="Toggle agent debug panel"
              >
                <Bug className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Chat + Canvas + Debug Area */}
        <div ref={containerRef} className="flex-1 min-h-0 flex overflow-hidden">
          {/* Chat panel */}
          <div
            className="flex flex-col min-h-0 p-6 flex-shrink-0"
            style={{ width: showCanvas ? chatWidth : undefined, flex: showCanvas ? undefined : '1' }}
          >
            <TutorChat
              messages={messages}
              artifacts={artifacts}
              isSending={isSending}
              isInitializing={isInitializing}
              onSendMessage={sendMessage}
              currentGoal={currentGoal}
              goalsCompleted={goalsCompleted}
              goalsRemaining={goalsRemaining}
              isSessionComplete={isSessionComplete}
              moduleName={module.name}
              moduleId={moduleId}
              sessionId={sessionId}
              onAppendVoiceTurn={appendVoiceTurn}
              canAttachDrawing={showCanvas}
              getWhiteboardPng={showCanvas ? getWhiteboardPng : undefined}
              suggestions={suggestions}
              isSuggestionsLoading={isSuggestionsLoading}
              streamingMessage={streamingMessage}
              className="flex-1 min-w-0"
            />
          </div>

          {/* Drag handle */}
          {showCanvas && (
            <div
              className="w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors"
              onMouseDown={handleDragStart}
            />
          )}

          {/* Whiteboard panel */}
          {showCanvas && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Whiteboard</span>
                <span className="text-xs text-muted-foreground">
                  Draw, then click the pencil icon to attach your drawing to a message
                </span>
              </div>
              <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
                <ExcalidrawCanvas
                  onExportReady={setExportCanvas}
                  className="absolute inset-0"
                />
              </div>
            </div>
          )}

          {/* Debug panel */}
          {showDebug && (
            <div className="w-80 flex-shrink-0 min-h-0 border-l p-4 overflow-y-auto">
              <TutorDebugPanel debugInfo={latestDebugInfo} currentGoal={currentGoal} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
