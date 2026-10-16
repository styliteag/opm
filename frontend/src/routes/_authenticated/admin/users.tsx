import { createFileRoute, redirect } from "@tanstack/react-router";

import { parseUsersTab } from "@/features/settings/settingsTabs";

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: (search: Record<string, unknown>): { tab?: "roles" } => ({
    tab: parseUsersTab(search.tab),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/settings/users", search: { tab: search.tab } });
  },
});
