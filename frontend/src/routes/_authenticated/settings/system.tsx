import { createFileRoute } from "@tanstack/react-router";

import { HostnameLookupPage } from "@/features/admin/components/HostnameLookupPage";

export const Route = createFileRoute("/_authenticated/settings/system")({
  component: SystemPage,
});

/**
 * Settings → System: administrative utilities. Currently hosts the
 * hostname cache; future admin utilities land here.
 */
function SystemPage() {
  return <HostnameLookupPage />;
}
