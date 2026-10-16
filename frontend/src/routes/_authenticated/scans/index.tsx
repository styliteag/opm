import { createFileRoute, redirect } from "@tanstack/react-router";

import { scansRedirectTarget } from "@/features/scans/lib/scansRedirect";

// UI v4: scan history moved to the network detail page; old links keep working.
export const Route = createFileRoute("/_authenticated/scans/")({
  validateSearch: (search: Record<string, unknown>): { network_id?: unknown } => ({
    network_id: search.network_id,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ ...scansRedirectTarget(search), replace: true });
  },
});
