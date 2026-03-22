import { createFileRoute, Navigate } from '@tanstack/react-router'

import { AppShell } from '@/components/layout/AppShell'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { useAuthStore } from '@/stores/auth.store'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { isLoading } = useCurrentUser()

  if (!token) {
    return <Navigate to="/login" />
  }

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-sm text-muted-foreground">Checking session...</p>
        </div>
      </div>
    )
  }

  return <AppShell />
}
