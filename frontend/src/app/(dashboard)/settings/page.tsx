'use client'

import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SettingsForm } from './components/SettingsForm'
import { ProfileEditForm } from '@/components/layout/ProfileEditForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useCoursesStore } from '@/lib/stores/courses-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, LogOut } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SettingsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { refetch } = useSettings()
  const { logout } = useAuthStore()
  const { setCourses } = useCoursesStore()

  const handleLogout = () => {
    logout()
    setCourses([])
    router.push('/login')
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-4xl">
            <div className="flex items-center gap-4 mb-6">
              <h1 className="text-2xl font-bold">{t.navigation.settings}</h1>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Profile Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <ProfileEditForm />
              </CardContent>
            </Card>

            <Separator className="my-6" />

            {/* System Settings */}
            <SettingsForm />

            <Separator className="my-6" />

            {/* Logout */}
            <Button
              variant="ghost"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
