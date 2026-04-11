import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Play, Copy, X } from "lucide-react";
import { toast } from "sonner";

import type { Network } from "@/lib/types";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  useNetworks,
  useScanners,
  useLatestScans,
} from "@/features/dashboard/hooks/useDashboardData";
import { useNetworkMutations } from "@/features/networks/hooks/useNetworkDetail";
import { NetworkForm } from "@/features/networks/components/NetworkForm";
import { SSH_ALERT_KEYS } from "@/features/admin/hooks/useAdmin";
import { isOnline } from "@/lib/utils";

type NetworksSearch = {
  filter?: "ssh-override";
};

export const Route = createFileRoute("/_authenticated/networks/")({
  validateSearch: (search: Record<string, unknown>): NetworksSearch => {
    const raw = search.filter;
    return raw === "ssh-override" ? { filter: "ssh-override" } : {};
  },
  component: NetworksPage,
});

function networkOverridesSsh(network: Network): boolean {
  const config = network.alert_config as Record<string, unknown> | null;
  if (!config) return false;
  return SSH_ALERT_KEYS.some((key) => key in config);
}

function NetworksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<Network | null>(null);
  const navigate = Route.useNavigate();
  const { filter } = Route.useSearch();
  const networks = useNetworks();
  const scanners = useScanners();
  const latestScans = useLatestScans();
  const { triggerScan } = useNetworkMutations();

  const scannerMap = useMemo(
    () => new Map((scanners.data?.scanners ?? []).map((s) => [s.id, s])),
    [scanners.data],
  );
  const scanMap = useMemo(
    () =>
      new Map(
        (latestScans.data?.latest_scans ?? []).map((s) => [
          s.network_id,
          s.scan,
        ]),
      ),
    [latestScans.data],
  );

  if (networks.isLoading) return <LoadingState rows={6} />;
  if (networks.error)
    return (
      <ErrorState
        message={networks.error.message}
        onRetry={() => networks.refetch()}
      />
    );

  const allNetworks = networks.data?.networks ?? [];
  const networkList =
    filter === "ssh-override"
      ? allNetworks.filter(networkOverridesSsh)
      : allNetworks;

  // Coverage stat reflects every network, regardless of any active filter.
  const totalCoverage =
    allNetworks.length > 0
      ? Math.round(
          (allNetworks.filter((n) => scanMap.get(n.id)?.status === "completed")
            .length /
            allNetworks.length) *
            100,
        )
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            System Configuration
          </p>
          <h1 className="text-2xl font-strong text-foreground">
            Network Definitions
          </h1>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Network
        </button>
      </div>

      {/* Scanner Status + Coverage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-strong text-foreground">
            Scanner Status
          </h3>
          <div className="mt-3 space-y-2">
            {(scanners.data?.scanners ?? []).map((scanner) => {
              const online = isOnline(scanner.last_seen_at);
              return (
                <div
                  key={scanner.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-foreground">{scanner.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {scanner.scanner_version ?? "Unknown version"}
                    </p>
                  </div>
                  <StatusBadge
                    label={online ? "Online" : "Offline"}
                    variant={online ? "success" : "danger"}
                    dot
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-strong text-foreground">
            Network Coverage
          </h3>
          <p className="mt-2 text-4xl font-strong text-foreground">
            {totalCoverage}%
          </p>
          <p className="text-sm text-muted-foreground">Total Visibility</p>
        </div>
      </div>

      {/* Active filter chip */}
      {filter === "ssh-override" && (
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => navigate({ search: {} })}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-emphasis text-primary hover:bg-primary/20 transition-colors"
            title="Filter entfernen"
          >
            SSH-Override aktiv
            <X className="h-3 w-3" />
          </button>
          <span className="text-xs text-muted-foreground">
            {networkList.length} von {allNetworks.length} Netzen
          </span>
        </div>
      )}

      {/* Network Cards */}
      {networkList.length === 0 ? (
        <EmptyState
          title={
            filter === "ssh-override"
              ? "Keine Netzwerke mit SSH-Override"
              : "No networks"
          }
          message={
            filter === "ssh-override"
              ? "Kein Netzwerk überschreibt aktuell die globalen SSH-Defaults."
              : "Add a network to start scanning."
          }
        />
      ) : (
        <div className="space-y-4">
          {networkList.map((network) => {
            const scan = scanMap.get(network.id);
            const scanner = scannerMap.get(network.scanner_id);

            return (
              <Link
                key={network.id}
                to="/networks/$networkId"
                params={{ networkId: String(network.id) }}
                className="block rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-strong text-foreground">
                      {network.name}
                    </h3>
                    <p className="mt-0.5 font-mono text-sm text-primary">
                      {network.cidr}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {network.scan_schedule && (
                      <StatusBadge label="Scheduled" variant="success" />
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setCloneSource(network);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/30 hover:text-primary transition-colors cursor-pointer"
                      title={`Create a copy of ${network.name}`}
                    >
                      <Copy className="h-3 w-3" />
                      Clone
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        triggerScan.mutate(network.id, {
                          onSuccess: () =>
                            toast.success(`Scan triggered for ${network.name}`),
                          onError: (err) => toast.error(err.message),
                        });
                      }}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      <Play className="h-3 w-3" />
                      Scan Now
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Port Spec</p>
                    <p className="text-sm text-foreground">
                      {network.port_spec}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scan Rate</p>
                    <p className="text-sm text-foreground">
                      {network.scan_rate ?? "-"} pps
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scanner</p>
                    <p className="text-sm text-foreground">
                      {scanner?.name ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Scan</p>
                    <p className="text-sm text-foreground">
                      {scan?.status === "completed"
                        ? `${scan.port_count} ports`
                        : (scan?.status ?? "Never")}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <NetworkForm open={createOpen} onOpenChange={setCreateOpen} />
      {cloneSource && (
        // Remount per source so react-hook-form picks up fresh defaults
        // when the user clones a different network in the same session.
        <NetworkForm
          key={`clone-${cloneSource.id}`}
          open
          onOpenChange={(open) => {
            if (!open) setCloneSource(null);
          }}
          cloneSource={cloneSource}
        />
      )}
    </div>
  );
}
