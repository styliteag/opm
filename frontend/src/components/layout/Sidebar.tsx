import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Home,
  Network,
  Settings,
  ShieldAlert,
  Waypoints,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHasRole } from "@/lib/roles";
import { NAV_V4 } from "@/lib/terminology";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui.store";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Path prefixes (besides `href`) that keep this entry highlighted. */
  activePrefixes: string[];
  /** Indented entries shown under this one; their paths win the highlight. */
  children?: NavItem[];
}

// Four areas (ADR 0009). Settings is visible to everyone; its sub-nav filters by role.
const NAV_ITEMS: NavItem[] = [
  { label: NAV_V4.home, href: "/", icon: Home, activePrefixes: [] },
  {
    label: NAV_V4.ports,
    href: "/ports",
    icon: Waypoints,
    activePrefixes: ["/hosts"],
  },
  {
    label: NAV_V4.networks,
    href: "/networks",
    icon: Network,
    activePrefixes: [],
    // Scan history is per network, so it sits under Networks (ADR 0009 amendment).
    children: [
      {
        label: NAV_V4.scans,
        href: "/scans",
        icon: History,
        activePrefixes: [],
      },
    ],
  },
  {
    label: NAV_V4.settings,
    href: "/settings",
    icon: Settings,
    activePrefixes: [],
  },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...item.activePrefixes].some((p) =>
    matchesPrefix(pathname, p),
  );
}

function NavLink({
  item,
  active,
  collapsed,
  sub = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  sub?: boolean;
}) {
  return (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      data-nav-level={sub ? "sub" : "top"}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-emphasis"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        sub && !collapsed && "ml-5 py-1.5 text-xs",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className={cn("shrink-0", sub ? "h-3.5 w-3.5" : "h-4 w-4")} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const openQuickScan = useUiStore((s) => s.openQuickScan);
  // Starting scans needs operator+ on the backend.
  const canScan = useHasRole("operator");
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <ShieldAlert className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-sm font-strong tracking-tight text-foreground">
            STYLiTE Orbit Monitor
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-none">
        {NAV_ITEMS.map((item) => (
          <div key={item.href} className="space-y-1">
            <NavLink
              item={item}
              active={isNavItemActive(item, currentPath)}
              collapsed={collapsed}
            />
            {/* Sub-entries only show while their section is open. */}
            {(isNavItemActive(item, currentPath) ||
              item.children?.some((c) => isNavItemActive(c, currentPath))) &&
              item.children?.map((child) => (
                <NavLink
                  key={child.href}
                  item={child}
                  active={isNavItemActive(child, currentPath)}
                  collapsed={collapsed}
                  sub
                />
              ))}
          </div>
        ))}
      </nav>

      {/* Scan Now Button */}
      {canScan && (
        <div className="border-t border-border p-3">
          <Button
            onClick={openQuickScan}
            className="w-full"
            title="Scan a network now"
          >
            <Zap className="h-4 w-4" />
            {!collapsed && <span>Scan Now</span>}
          </Button>
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
