import { createFileRoute } from '@tanstack/react-router'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TwoFactorEnrollWizard } from '@/features/auth/components/TwoFactorEnrollWizard'
import { TwoFactorManagePanel } from '@/features/auth/components/TwoFactorManagePanel'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecuritySettingsPage,
})

function SecuritySettingsPage() {
  const { data: user, isLoading } = useCurrentUser()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account's security settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-emphasis text-foreground">
            Two-factor authentication
          </h2>
        </CardHeader>
        <CardContent>
          {isLoading || !user ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : user.totp_enabled ? (
            <TwoFactorManagePanel
              backupCodesRemaining={user.backup_codes_remaining ?? 0}
            />
          ) : (
            <TwoFactorEnrollWizard />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
