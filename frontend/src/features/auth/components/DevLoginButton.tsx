import { Button } from '@/components/ui/button'

import { useLogin } from '../hooks/useLogin'

export function DevLoginButton() {
  const loginMutation = useLogin()

  if (import.meta.env.PROD) return null

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() =>
        loginMutation.mutate({
          email: import.meta.env.VITE_DEV_ADMIN_EMAIL ?? 'admin@example.com',
          password: import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? 'changeme',
        })
      }
      disabled={loginMutation.isPending}
    >
      Dev Login (admin)
    </Button>
  )
}
