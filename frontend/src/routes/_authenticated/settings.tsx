import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import {
  isSettingsEntryActive,
  visibleSettingsNav,
} from "@/features/settings/settingsNav";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

/**
 * Settings hub (ADR 0009): one left sub-navigation instead of nested hub
 * pages. Entries are filtered by role; the pages themselves are unchanged.
 */
function SettingsLayout() {
  const role = useAuthStore((s) => s.user?.role);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const entries = visibleSettingsNav(role);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="shrink-0 md:w-48">
        <h1 className="mb-3 px-3 text-2xl font-strong text-foreground">
          Settings
        </h1>
        <nav aria-label="Settings" className="flex flex-wrap gap-1 md:flex-col">
          {entries.map((entry) => {
            const active = isSettingsEntryActive(entry.href, pathname);
            return (
              <Link
                key={entry.href}
                to={entry.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-emphasis"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
