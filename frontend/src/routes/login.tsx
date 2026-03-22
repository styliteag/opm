import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { DevLoginButton } from '@/features/auth/components/DevLoginButton'
import { useAuthStore } from '@/stores/auth.store'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/" />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldAlert className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Sentinel Lens
          </h1>
          <p className="text-sm text-muted-foreground">
            Secure access to your attack surface monitor
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <DevLoginButton />
        </CardContent>
      </Card>
    </div>
  )
}
