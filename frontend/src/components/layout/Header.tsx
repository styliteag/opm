import { useRouterState } from '@tanstack/react-router'
import { LogOut, Moon, Sun, SunMoon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'

function Breadcrumbs() {
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )

  if (segments.length === 0) segments.push('Dashboard')

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <span
            className={
              i === segments.length - 1
                ? 'font-medium text-foreground'
                : 'text-muted-foreground'
            }
          >
            {segment}
          </span>
        </span>
      ))}
    </nav>
  )
}

function ThemeSwitcher() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  const nextMode = mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark'
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : SunMoon

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setMode(nextMode)}
      title={`Theme: ${mode}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function Header() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <Breadcrumbs />

      <div className="flex items-center gap-3">
        <ThemeSwitcher />

        {user && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{user.email}</p>
              <Badge variant="outline" className="text-[10px] capitalize">
                {user.role}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
