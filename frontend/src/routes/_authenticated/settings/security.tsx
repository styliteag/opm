import { createFileRoute } from '@tanstack/react-router'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PasswordChangeCard } from '@/features/auth/components/PasswordChangeCard'
import { TwoFactorEnrollWizard } from '@/features/auth/components/TwoFactorEnrollWizard'
import { TwoFactorManagePanel } from '@/features/auth/components/TwoFactorManagePanel'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecuritySettingsPage,
})

function SecuritySettingsPage() {
  const { data: user, isLoading } = useCurrentUser()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-strong text-foreground">
          Account security
        </h2>
        <p className="text-sm text-muted-foreground">
          Password and two-factor authentication for your account.
        </p>
      </div>

      <PasswordChangeCard />

      <Card>
        <CardHeader>
          <h3 className="text-lg font-emphasis text-foreground">
            Two-factor authentication
          </h3>
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
