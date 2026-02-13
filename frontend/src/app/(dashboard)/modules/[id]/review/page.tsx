'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { TutorChat } from '@/components/tutor/TutorChat'
import { useTutor } from '@/lib/hooks/use-tutor'
import { useModule } from '@/lib/hooks/use-modules'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function ReviewPage() {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()

  const moduleId = params?.id ? decodeURIComponent(params.id as string) : ''

  const { data: module, isLoading: moduleLoading } = useModule(moduleId)
  const {
    messages,
    isSending,
    isInitializing,
    sessionPhase,
    currentGoal,
    goalsCompleted,
    goalsRemaining,
    isSessionComplete,
    initializeSession,
    sendMessage,
  } = useTutor({ moduleId })

  // Initialize the tutor session when the page loads
  useEffect(() => {
    if (moduleId && !isInitializing && messages.length === 0) {
      initializeSession()
    }
  }, [moduleId, isInitializing, messages.length, initializeSession])

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
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/modules/${moduleId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t.common.back}
            </Button>
            <h1 className="text-xl font-semibold">
              {t.tutor.reviewSession}: {module.name}
            </h1>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 p-6 min-h-0">
          <TutorChat
            messages={messages}
            isSending={isSending}
            isInitializing={isInitializing}
            onSendMessage={sendMessage}
            currentGoal={currentGoal}
            goalsCompleted={goalsCompleted}
            goalsRemaining={goalsRemaining}
            isSessionComplete={isSessionComplete}
            moduleName={module.name}
          />
        </div>
      </div>
    </AppShell>
  )
}
