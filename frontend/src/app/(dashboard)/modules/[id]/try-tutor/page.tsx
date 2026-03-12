'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TutorChat } from '@/components/tutor/TutorChat'
import { TutorDebugPanel } from '@/components/tutor/TutorDebugPanel'
import { ExcalidrawCanvas } from '@/components/tutor/ExcalidrawCanvas'
import { useTutor } from '@/lib/hooks/use-tutor'
import { useModule } from '@/lib/hooks/use-modules'
import { modulesApi } from '@/lib/api/modules'
import { useModuleDraftStore } from '@/lib/stores/module-draft-store'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Trash2, RotateCcw, Bug, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function TryTutorPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()

  const moduleId = params?.id ? decodeURIComponent(params.id as string) : ''
  const hasInitializedRef = useRef(false)

  const { reset: resetDraftStore } = useModuleDraftStore()
  const { data: module, isLoading: moduleLoading } = useModule(moduleId)

  const [isPublishing, setIsPublishing] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showCanvas, setShowCanvas] = useState(true)

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
    messages,
    artifacts,
    isSending,
    isInitializing,
    currentGoal,
    goalsCompleted,
    goalsRemaining,
    isSessionComplete,
    sessionId,
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

  useEffect(() => {
    if (moduleId && !hasInitializedRef.current) {
      hasInitializedRef.current = true
      initializeSession()
    }
  }, [moduleId, initializeSession])

  useEffect(() => {
    if (module && module.status !== 'draft') {
      toast.error('Only draft modules can be tested in Try Tutor')
      router.replace(`/modules/${encodeURIComponent(moduleId)}`)
    }
  }, [module, moduleId, router])

  const handlePublish = useCallback(async () => {
    if (!module || module.status !== 'draft') {
      toast.error('Only draft modules can be published from this page')
      return
    }

    setIsPublishing(true)
    try {
      await modulesApi.publish(moduleId)
      resetDraftStore()
      toast.success(t.tutor.publish)
      router.push(`/modules/${encodeURIComponent(moduleId)}`)
    } catch (error) {
      console.error('Error publishing module:', error)
      toast.error('Failed to publish module')
    } finally {
      setIsPublishing(false)
    }
  }, [module, moduleId, resetDraftStore, router, t.tutor.publish])

  const handleDiscard = useCallback(async () => {
    if (!module || module.status !== 'draft') {
      toast.error('Only draft modules can be discarded from this page')
      return
    }

    setIsDiscarding(true)
    try {
      await modulesApi.discardDraft(moduleId)
      resetDraftStore()
      router.push('/courses')
    } catch (error) {
      console.error('Error discarding draft:', error)
      toast.error('Failed to discard draft')
    } finally {
      setIsDiscarding(false)
      setShowDiscardDialog(false)
    }
  }, [module, moduleId, resetDraftStore, router])

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
          <Button variant="outline" onClick={() => router.push('/courses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.common.back}
          </Button>
        </div>
      </AppShell>
    )
  }

  const isDraftModule = module.status === 'draft'

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
                onClick={() => setShowDiscardDialog(true)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t.common.back}
              </Button>
              <h1 className="text-xl font-semibold">
                {t.tutor.tryTutor}: {module.name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTryAgain}
                disabled={!isDraftModule || isInitializing || isSending}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDiscardDialog(true)}
                disabled={!isDraftModule || isDiscarding}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t.tutor.discard}
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={handlePublish}
                disabled={!isDraftModule || isPublishing}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isPublishing ? t.tutor.publishing : t.tutor.publish}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-12">
            {t.tutor.tryTutorDescription}
          </p>
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

      {/* Discard confirmation dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.tutor.discard}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.tutor.discardConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDiscarding ? t.tutor.discarding : t.tutor.discard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
