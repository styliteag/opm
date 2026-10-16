import { createFileRoute } from "@tanstack/react-router";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { HubTabs } from "@/components/layout/HubTabs";
import { NetworkTrendChart } from "@/features/networks/components/NetworkTrendChart";
import { PortRulesEditor } from "@/features/networks/components/PortRulesEditor";
import { NetworkDetailHeader } from "@/features/networks/components/detail/NetworkDetailHeader";
import { NetworkScansTab } from "@/features/networks/components/detail/NetworkScansTab";
import { NetworkSettingsTab } from "@/features/networks/components/detail/NetworkSettingsTab";
import { NetworkStatusSummary } from "@/features/networks/components/detail/NetworkStatusSummary";
import {
  useNetworkOverview,
  useNetworkRules,
} from "@/features/networks/hooks/useNetworkDetail";
import {
  NETWORK_TABS,
  parseNetworkTab,
  type NetworkTab,
} from "@/features/networks/lib/networkTabs";
import { PortsTab } from "@/features/ports/components/PortsTab";
import { useHasRole } from "@/lib/roles";

type NetworkDetailSearch = {
  tab?: NetworkTab;
};

export const Route = createFileRoute("/_authenticated/networks/$networkId")({
  validateSearch: (search: Record<string, unknown>): NetworkDetailSearch => {
    const tab = parseNetworkTab(search.tab);
    return tab === "ports" ? {} : { tab };
  },
  component: NetworkDetailPage,
});

function NetworkDetailPage() {
  const { networkId } = Route.useParams();
  const id = Number(networkId);
  const { tab = "ports" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const overview = useNetworkOverview(id);
  const rules = useNetworkRules(id);
  const canOperate = useHasRole("operator");

  if (overview.isLoading) return <LoadingState rows={6} />;
  if (overview.error)
    return (
      <ErrorState message={overview.error.message} onRetry={overview.refetch} />
    );
  if (!overview.data) return <ErrorState message="Network not found" />;

  const ov = overview.data;

  return (
    <div className="space-y-6">
      <NetworkDetailHeader overview={ov} canOperate={canOperate} />
      <NetworkStatusSummary overview={ov} />
      <NetworkTrendChart networkId={id} />

      <HubTabs
        tabs={NETWORK_TABS}
        active={tab}
        onChange={(next) =>
          void navigate({
            search: next === "ports" ? {} : { tab: next },
            replace: true,
          })
        }
      />

      {tab === "ports" && <PortsTab key={id} initialNetworkId={id} />}
      {tab === "scans" && (
        <NetworkScansTab networkId={id} canOperate={canOperate} />
      )}
      {tab === "rules" && (
        <PortRulesEditor networkId={id} rules={rules.data?.rules ?? []} />
      )}
      {tab === "settings" && (
        <NetworkSettingsTab
          network={ov.network}
          scannerName={ov.scanner_name}
          canOperate={canOperate}
        />
      )}
    </div>
  );
}
