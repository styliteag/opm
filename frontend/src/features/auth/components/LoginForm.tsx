import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { loginSchema, type LoginFormData } from '../auth.schemas'
import { useFinalizeLogin, useLogin, useVerify2FA } from '../hooks/useLogin'

export function LoginForm() {
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [code, setCode] = useState('')

  const loginMutation = useLogin()
  const verifyMutation = useVerify2FA()
  const finalize = useFinalizeLogin()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data, {
      onSuccess: async (resp) => {
        if (resp.requires_2fa && resp.challenge_token) {
          setChallengeToken(resp.challenge_token)
          return
        }
        if (resp.access_token) {
          await finalize(resp.access_token)
        }
      },
    })
  }

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault()
    if (!challengeToken) return
    verifyMutation.mutate({
      challenge_token: challengeToken,
      code: code.trim(),
    })
  }

  if (challengeToken) {
    return (
      <form onSubmit={onVerify} className="space-y-4">
        <div>
          <Label htmlFor="totp-code">Verification code</Label>
          <Input
            id="totp-code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456 or backup code"
            className="mt-1 font-mono"
            autoFocus
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the 6-digit code from your authenticator app, or a backup code.
          </p>
        </div>

        {verifyMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>{verifyMutation.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            className="flex-1"
            disabled={code.length === 0 || verifyMutation.isPending}
          >
            {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setChallengeToken(null)
              setCode('')
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          placeholder="admin@example.com"
          className="mt-1"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          placeholder="Enter password"
          className="mt-1"
        />
        {errors.password && (
          <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      {loginMutation.error && (
        <Alert variant="destructive">
          <AlertDescription>{loginMutation.error.message}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || loginMutation.isPending}
      >
        {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  )
}
