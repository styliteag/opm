import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useDisable2fa, useRegenerateBackupCodes } from '../hooks/use2fa'

interface Props {
  backupCodesRemaining: number
}

export function TwoFactorManagePanel({ backupCodesRemaining }: Props) {
  const [mode, setMode] = useState<'view' | 'disable' | 'regenerate'>('view')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)

  const disableMutation = useDisable2fa()
  const regenerateMutation = useRegenerateBackupCodes()

  const resetForm = () => {
    setPassword('')
    setCode('')
  }

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault()
    disableMutation.mutate(
      { password, code: code.trim() },
      {
        onSuccess: () => {
          resetForm()
          // Logout happens inside useDisable2fa, browser redirects
        },
      },
    )
  }

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault()
    regenerateMutation.mutate(
      { password, code: code.trim() },
      {
        onSuccess: (data) => {
          setNewCodes(data.backup_codes)
          resetForm()
          setMode('view')
        },
      },
    )
  }

  if (mode === 'view') {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Two-factor authentication is enabled. {backupCodesRemaining} backup code
            {backupCodesRemaining === 1 ? '' : 's'} remaining.
          </AlertDescription>
        </Alert>

        {newCodes && (
          <div className="space-y-2 rounded-md border border-border bg-card p-4">
            <p className="text-sm font-emphasis">New backup codes — save them now:</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {newCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMode('regenerate')}>
            Regenerate backup codes
          </Button>
          <Button variant="destructive" onClick={() => setMode('disable')}>
            Disable 2FA
          </Button>
        </div>
      </div>
    )
  }

  const mutation = mode === 'disable' ? disableMutation : regenerateMutation
  const onSubmit = mode === 'disable' ? handleDisable : handleRegenerate
  const title =
    mode === 'disable' ? 'Disable 2FA' : 'Regenerate backup codes'
  const submitLabel =
    mode === 'disable' ? 'Disable 2FA' : 'Generate new codes'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm font-emphasis text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">
        Confirm with your password and a current 6-digit code from your authenticator.
      </p>

      <div>
        <Label htmlFor="mgmt-password">Password</Label>
        <Input
          id="mgmt-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="mgmt-code">6-digit code</Label>
        <Input
          id="mgmt-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="mt-1 font-mono"
        />
      </div>

      {mutation.error && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant={mode === 'disable' ? 'destructive' : 'default'}
          disabled={
            password.length === 0 || code.length !== 6 || mutation.isPending
          }
        >
          {mutation.isPending ? 'Working…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            resetForm()
            setMode('view')
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
