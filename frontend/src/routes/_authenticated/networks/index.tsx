import { createFileRoute } from "@tanstack/react-router";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import {
  useLatestScans,
  useNetworks,
  useScanners,
} from "@/features/dashboard/hooks/useDashboardData";
import { NetworksList } from "@/features/networks/components/NetworksList";
import { useHasRole } from "@/lib/roles";

type NetworksSearch = {
  filter?: "ssh-override";
};

export const Route = createFileRoute("/_authenticated/networks/")({
  validateSearch: (search: Record<string, unknown>): NetworksSearch =>
    search.filter === "ssh-override" ? { filter: "ssh-override" } : {},
  component: NetworksPage,
});

function NetworksPage() {
  const navigate = Route.useNavigate();
  const { filter } = Route.useSearch();
  const networks = useNetworks();
  const scanners = useScanners();
  const latestScans = useLatestScans();
  const canOperate = useHasRole("operator");

  if (networks.isLoading) return <LoadingState rows={6} />;
  if (networks.error)
    return (
      <ErrorState
        message={networks.error.message}
        onRetry={() => networks.refetch()}
      />
    );

  return (
    <NetworksList
      networks={networks.data?.networks ?? []}
      scanners={scanners.data?.scanners ?? []}
      latestScans={latestScans.data?.latest_scans ?? []}
      canOperate={canOperate}
      sshOverrideOnly={filter === "ssh-override"}
      onClearFilter={() => void navigate({ search: {} })}
    />
  );
}
