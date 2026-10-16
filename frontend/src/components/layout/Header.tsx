import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  SunMoon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useHostDetail } from "@/features/hosts/hooks/useHosts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth.store";
import { useThemeStore } from "@/stores/theme.store";

import { breadcrumbSegments, hostIdFromPath } from "./breadcrumbs";

function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hostId = hostIdFromPath(pathname);
  return hostId === null ? (
    <BreadcrumbTrail segments={breadcrumbSegments(pathname)} />
  ) : (
    <HostBreadcrumbs pathname={pathname} hostId={hostId} />
  );
}

/** Host pages show the hostname (or IP) from the shared host query, not the id. */
function HostBreadcrumbs({
  pathname,
  hostId,
}: {
  pathname: string;
  hostId: number;
}) {
  const { data } = useHostDetail(hostId);
  const label = data ? (data.host.hostname ?? data.host.ip) : undefined;
  return <BreadcrumbTrail segments={breadcrumbSegments(pathname, label)} />;
}

function BreadcrumbTrail({ segments }: { segments: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">/</span>}
          <span
            className={
              i === segments.length - 1
                ? "font-emphasis text-foreground"
                : "text-muted-foreground"
            }
          >
            {segment}
          </span>
        </span>
      ))}
    </nav>
  );
}

const NEXT_THEME = { dark: "light", light: "system", system: "dark" } as const;
const THEME_ICON = { dark: Moon, light: Sun, system: SunMoon } as const;

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const navigate = useNavigate();

  if (!user) return null;

  const ThemeIcon = THEME_ICON[mode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="User menu"
        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-right transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          <span className="block text-sm font-emphasis text-foreground">
            {user.email}
          </span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {user.role}
          </Badge>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Signed in as {user.email} ({user.role})
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void navigate({ to: "/settings/security" })}
        >
          <ShieldCheck />
          Account security
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() => setMode(NEXT_THEME[mode])}
        >
          <ThemeIcon />
          <span className="capitalize">Theme: {mode}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <Breadcrumbs />
      <UserMenu />
    </header>
  );
}
