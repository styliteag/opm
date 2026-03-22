import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Monitor,
  Scan,
  ShieldAlert,
  Network,
  FileCode,
  FileSearch,
  Server,
  Users,
  Shield,
  Building,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useUiStore } from '@/stores/ui.store'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const mainNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Hosts', href: '/hosts', icon: Monitor },
  { label: 'Scans', href: '/scans', icon: Scan },
  { label: 'Alerts', href: '/alerts', icon: ShieldAlert },
  { label: 'Networks', href: '/networks', icon: Network },
  { label: 'Trends', href: '/trends', icon: TrendingUp },
]

const toolsNav: NavItem[] = [
  { label: 'NSE Scripts', href: '/nse/profiles', icon: FileCode },
  { label: 'Results', href: '/nse/results', icon: FileSearch },
]

const settingsNav: NavItem[] = [
  { label: 'Port Rules', href: '/port-rules', icon: Shield },
]

const adminNav: NavItem[] = [
  { label: 'Scanners', href: '/scanners', icon: Server },
  { label: 'Users', href: '/admin/users', icon: Users, adminOnly: true },
  { label: 'Roles', href: '/admin/roles', icon: Shield, adminOnly: true },
  { label: 'Organization', href: '/admin/organization', icon: Building, adminOnly: true },
]

function NavGroup({
  items,
  collapsed,
  label,
}: {
  items: NavItem[]
  collapsed: boolean
  label?: string
}) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const userRole = useAuthStore((s) => s.user?.role)

  const filteredItems = items.filter(
    (item) => !item.adminOnly || userRole === 'admin',
  )

  if (filteredItems.length === 0) return null

  return (
    <div className="space-y-1">
      {label && !collapsed && (
        <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {filteredItems.map((item) => {
        const isActive =
          item.href === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.href)

        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openQuickScan = useUiStore((s) => s.openQuickScan)

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-background transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <ShieldAlert className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-display text-sm font-semibold tracking-tight text-foreground">
            Sentinel Lens
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-3 scrollbar-none">
        <NavGroup items={mainNav} collapsed={collapsed} />
        <NavGroup items={toolsNav} collapsed={collapsed} label="Tools" />
        <NavGroup items={settingsNav} collapsed={collapsed} label="Settings" />
        <NavGroup items={adminNav} collapsed={collapsed} label="Admin" />
      </nav>

      {/* Scan Now Button */}
      <div className="border-t border-border p-3">
        <Button
          onClick={openQuickScan}
          className="w-full"
          title="Quick Scan"
        >
          <Zap className="h-4 w-4" />
          {!collapsed && <span>Scan Now</span>}
        </Button>
      </div>

      {/* Collapse Toggle */}
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  )
}
