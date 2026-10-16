import { createFileRoute, redirect } from "@tanstack/react-router";

import { rulesTabFromAlerting } from "@/features/settings/settingsTabs";

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/alerting")({
  validateSearch: (search: Record<string, unknown>): { tab?: unknown } => ({
    tab: search.tab,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/settings/rules",
      search: { tab: rulesTabFromAlerting(search.tab) },
    });
  },
});
