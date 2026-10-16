import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HubTabs } from "@/components/layout/HubTabs";
import { HostsTab } from "@/features/ports/components/HostsTab";
import { PortsTab } from "@/features/ports/components/PortsTab";

type PortsTabKey = "ports" | "hosts";

const TABS = [
  { key: "ports", label: "Ports" },
  { key: "hosts", label: "Hosts" },
] as const;

interface PortsSearchParams {
  tab?: PortsTabKey;
  search?: string;
  network_id?: number;
}

// Ports page (UI v4, ADR 0008): every open port first, host inventory second.
export const Route = createFileRoute("/_authenticated/ports")({
  component: PortsPage,
  validateSearch: (search: Record<string, unknown>): PortsSearchParams => ({
    tab: search.tab === "hosts" ? "hosts" : undefined,
    search: typeof search.search === "string" ? search.search : undefined,
    network_id: search.network_id ? Number(search.network_id) : undefined,
  }),
});

function PortsPage() {
  const { tab, search, network_id } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const active: PortsTabKey = tab ?? "ports";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">Ports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which ports are open, which are new, and why.
        </p>
      </div>

      <HubTabs
        tabs={TABS}
        active={active}
        onChange={(key) =>
          void navigate({
            search: { tab: key === "hosts" ? "hosts" : undefined },
            replace: true,
          })
        }
      />

      {active === "hosts" ? (
        <HostsTab initialSearch={search} initialNetworkId={network_id} />
      ) : (
        <PortsTab initialSearch={search} initialNetworkId={network_id} />
      )}
    </div>
  );
}
