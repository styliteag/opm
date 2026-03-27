import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Play, Radar } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { PortRulesEditor } from "@/features/networks/components/PortRulesEditor";
import { NetworkForm } from "@/features/networks/components/NetworkForm";
import {
  useNetworkDetail,
  useNetworkScans,
  useNetworkRules,
  useNetworkMutations,
} from "@/features/networks/hooks/useNetworkDetail";
import { fetchApi } from "@/lib/api";
import { formatRelativeTime, scanStatusVariant } from "@/lib/utils";

interface HostDiscoveryScan {
  id: number;
  network_id: number;
  scanner_id: number;
  status: string;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  hosts_discovered: number;
  error_message: string | null;
}

export const Route = createFileRoute("/_authenticated/networks/$networkId")({
  component: NetworkDetailPage,
});

function NetworkDetailPage() {
  const { networkId } = Route.useParams();
  const id = Number(networkId);
  const [editOpen, setEditOpen] = useState(false);
  const network = useNetworkDetail(id);
  const scans = useNetworkScans(id);
  const rules = useNetworkRules(id);
  const { triggerScan, triggerDiscovery } = useNetworkMutations();
  const discoveryScans = useQuery({
    queryKey: ["networks", id, "host-discovery-scans"],
    queryFn: () =>
      fetchApi<{ scans: HostDiscoveryScan[] }>(
        `/api/networks/${id}/host-discovery-scans`,
      ),
    enabled: id > 0,
    refetchInterval: 15_000,
  });

  if (network.isLoading) return <LoadingState rows={6} />;
  if (network.error)
    return (
      <ErrorState message={network.error.message} onRetry={network.refetch} />
    );
  if (!network.data) return <ErrorState message="Network not found" />;

  const n = network.data;
  const scanList = scans.data?.scans ?? [];
  const ruleList = rules.data?.rules ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/networks"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {n.name}
          </h1>
          <p className="mt-0.5 font-mono text-sm text-primary">{n.cidr}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            size="sm"
            disabled={triggerScan.isPending}
            onClick={() =>
              triggerScan.mutate(id, {
                onSuccess: () => toast.success("Scan triggered"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {triggerScan.isPending ? "Starting..." : "Start Scan"}
          </Button>
        </div>
      </div>

      {/* Network Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Port Spec", value: n.port_spec },
          { label: "Scan Rate", value: `${n.scan_rate ?? "-"} pps` },
          { label: "Protocol", value: n.scan_protocol.toUpperCase() },
          { label: "Schedule", value: n.scan_schedule ?? "Manual only" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Port Rules */}
      <PortRulesEditor networkId={id} rules={ruleList} />

      {/* Alert Settings */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-display text-sm font-semibold text-foreground mb-3">
          Alert Settings
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">
              SSH Security Scanning
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.alert_config?.ssh_enabled !== false ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Host Discovery</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.host_discovery_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">NSE Profile</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.nse_profile_id ? `Profile #${n.nse_profile_id}` : "None"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">IPv6</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.is_ipv6 ? "Yes" : "No"}
            </p>
          </div>
        </div>
      </div>

      {/* Host Discovery */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Host Discovery
          </h3>
          <Button
            variant="outline"
            size="sm"
            disabled={triggerDiscovery.isPending}
            onClick={() =>
              triggerDiscovery.mutate(id, {
                onSuccess: () => toast.success("Host discovery scan triggered"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <Radar className="h-3.5 w-3.5 mr-1.5" />
            {triggerDiscovery.isPending ? "Starting..." : "Discover Hosts"}
          </Button>
        </div>
        {(discoveryScans.data?.scans ?? []).length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">
            No host discovery scans yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(discoveryScans.data?.scans ?? []).slice(0, 10).map((ds) => (
              <div
                key={ds.id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">
                    Discovery #{ds.id} · {ds.hosts_discovered} hosts found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ds.trigger_type}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge
                    label={ds.status}
                    variant={scanStatusVariant(ds.status)}
                    dot
                  />
                  {ds.completed_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(ds.completed_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Scans */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border bg-card px-5 py-3">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Scan History ({scanList.length})
          </h3>
        </div>
        {scanList.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No scans yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {scanList.slice(0, 20).map((scan) => (
              <Link
                key={scan.id}
                to="/scans/$scanId"
                params={{ scanId: String(scan.id) }}
                className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <div>
                  <p className="text-sm text-foreground">
                    Scan #{scan.id} · {scan.port_count} ports
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scan.trigger_type}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge
                    label={scan.status}
                    variant={scanStatusVariant(scan.status)}
                    dot
                  />
                  {scan.completed_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(scan.completed_at)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <NetworkForm open={editOpen} onOpenChange={setEditOpen} network={n} />
    </div>
  );
}
