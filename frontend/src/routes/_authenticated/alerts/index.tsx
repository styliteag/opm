import { createFileRoute, redirect } from "@tanstack/react-router";

import { parseHomeFilters } from "@/features/home/lib/homeFilters";

// UI v4 cut-over: the alerts inbox became the Home queue (ADR 0009).
// v3 links carry `search` (kept) and `source` (dropped: Home splits ports from findings).
export const Route = createFileRoute("/_authenticated/alerts/")({
  validateSearch: (search: Record<string, unknown>) => parseHomeFilters(search),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/", search });
  },
});
