import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useEnrollStart, useEnrollVerify } from '../hooks/use2fa'

type Step = 'password' | 'scan' | 'done'

export function TwoFactorEnrollWizard() {
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')
  const [otpauthUri, setOtpauthUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const startMutation = useEnrollStart()
  const verifyMutation = useEnrollVerify()

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault()
    startMutation.mutate(password, {
      onSuccess: (data) => {
        setSecret(data.secret)
        setOtpauthUri(data.otpauth_uri)
        setStep('scan')
      },
    })
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    verifyMutation.mutate(
      { password, code: code.trim() },
      {
        onSuccess: (data) => {
          setBackupCodes(data.backup_codes)
          setPassword('')
          setStep('done')
        },
      },
    )
  }

  const downloadBackupCodes = () => {
    const blob = new Blob(
      [
        'STYLiTE Orbit Monitor — 2FA Backup Codes',
        '',
        'Store these in a safe place. Each code can be used once.',
        '',
        ...backupCodes,
        '',
      ].join('\n'),
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'opm-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (step === 'password') {
    return (
      <form onSubmit={handleStart} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enable time-based one-time passwords (TOTP) as a second login factor. You
          will need an authenticator app such as 1Password, Authy, or Google
          Authenticator. Confirm your password to begin.
        </p>
        <div>
          <Label htmlFor="enroll-password">Password</Label>
          <Input
            id="enroll-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
        </div>
        {startMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>{startMutation.error.message}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          disabled={password.length === 0 || startMutation.isPending}
        >
          {startMutation.isPending ? 'Starting…' : 'Continue'}
        </Button>
      </form>
    )
  }

  if (step === 'scan') {
    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-emphasis text-foreground">
            1. Scan this QR code with your authenticator app
          </p>
          <div className="inline-block rounded-md bg-white p-3">
            <QRCodeSVG value={otpauthUri} size={192} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Or enter this secret manually:{' '}
            <code className="font-mono text-foreground">{secret}</code>
          </p>
        </div>

        <div>
          <Label htmlFor="totp-code">2. Enter the 6-digit code</Label>
          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="mt-1 font-mono"
          />
        </div>

        {verifyMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>{verifyMutation.error.message}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={code.length !== 6 || verifyMutation.isPending}>
          {verifyMutation.isPending ? 'Verifying…' : 'Verify and activate'}
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          2FA is now enabled. Save these backup codes — they are shown only once.
          Each code works for exactly one login.
        </AlertDescription>
      </Alert>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card p-4 font-mono text-sm">
        {backupCodes.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={downloadBackupCodes} variant="secondary">
          Download as text file
        </Button>
      </div>
    </div>
  )
}
