import { createFileRoute } from "@tanstack/react-router";

import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { RecentScansPage } from "@/features/scans/components/RecentScansPage";
import { parseScansSearch, type ScansSearch } from "@/features/scans/lib/scansQuery";

// Recent scans across all networks. Not in the sidebar (ADR 0009); linked from
// Home and the Networks page. `?network_id=` and `?status=` preset the filters.
export const Route = createFileRoute("/_authenticated/scans/")({
  validateSearch: (search: Record<string, unknown>): ScansSearch => parseScansSearch(search),
  component: ScansPage,
});

function ScansPage() {
  const navigate = Route.useNavigate();
  const { network_id, status } = Route.useSearch();
  const networks = useNetworks();

  return (
    <RecentScansPage
      networks={networks.data?.networks ?? []}
      status={status ?? "all"}
      networkId={network_id}
      onFiltersChange={(f) =>
        void navigate({
          search: {
            ...(f.networkId ? { network_id: f.networkId } : {}),
            ...(f.status !== "all" ? { status: f.status } : {}),
          },
          replace: true,
        })
      }
    />
  );
}
