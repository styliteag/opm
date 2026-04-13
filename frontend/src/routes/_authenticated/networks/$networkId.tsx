import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Monitor,
  Pencil,
  Play,
  Radar,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { PortRulesEditor } from "@/features/networks/components/PortRulesEditor";
import { NetworkForm } from "@/features/networks/components/NetworkForm";
import { NetworkHealthCards } from "@/features/networks/components/NetworkHealthCards";
import { NetworkTrendChart } from "@/features/networks/components/NetworkTrendChart";
import {
  useNetworkOverview,
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
  const overview = useNetworkOverview(id);
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

  if (overview.isLoading) return <LoadingState rows={6} />;
  if (overview.error)
    return (
      <ErrorState message={overview.error.message} onRetry={overview.refetch} />
    );
  if (!overview.data) return <ErrorState message="Network not found" />;

  const ov = overview.data;
  const n = ov.network;
  const scanList = scans.data?.scans ?? [];
  const ruleList = rules.data?.rules ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/networks"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-strong text-foreground">{n.name}</h1>
          <div className="mt-0.5 flex items-center gap-3">
            <span className="font-mono text-sm text-primary">{n.cidr}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {ov.scanner_name}
            </span>
            <StatusBadge
              label={ov.scanner_online ? "Online" : "Offline"}
              variant={ov.scanner_online ? "success" : "danger"}
              dot
            />
          </div>
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

      {/* Health Stats */}
      <NetworkHealthCards overview={ov} />

      {/* Alert Trend */}
      <NetworkTrendChart networkId={id} />

      {/* Quick Links */}
      <div className="flex items-center gap-2">
        <Link
          to="/hosts"
          search={{ network_id: id }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Monitor className="h-3.5 w-3.5 mr-1.5" />
          View Hosts
        </Link>
        <Link
          to="/scans"
          search={{ network_id: id }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ScanLine className="h-3.5 w-3.5 mr-1.5" />
          View Scans
        </Link>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-4">
          {/* Scan Pipeline */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Scan Pipeline
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {n.scanner_type === "nse" ? (
                <PhasePill label="NSE" active />
              ) : (
                <>
                  {n.host_discovery_enabled && (
                    <>
                      <PhasePill label="Host Discovery" active />
                      <span className="text-quaternary">&rarr;</span>
                    </>
                  )}
                  <PhasePill
                    label={n.scanner_type === "masscan" ? "Masscan" : "Nmap"}
                    active
                  />
                  {n.ssh_probe_enabled && (
                    <>
                      <span className="text-quaternary">&rarr;</span>
                      <PhasePill label="SSH Probe" active />
                    </>
                  )}
                  {n.nuclei_enabled && (
                    <>
                      <span className="text-quaternary">&rarr;</span>
                      <PhasePill label="Nuclei" active />
                    </>
                  )}
                </>
              )}
              {n.scanner_type === "greenbone" && (
                <PhasePill label="Greenbone / GVM" active />
              )}
            </div>
          </div>

          {/* Alert & Feature Settings */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Features &amp; Alerts
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <ConfigField
                label="SSH Scanning"
                value={
                  n.alert_config?.ssh_enabled !== false
                    ? "Enabled"
                    : "Disabled"
                }
              />
              <ConfigField
                label="Host Discovery"
                value={n.host_discovery_enabled ? "Enabled" : "Disabled"}
              />
              <ConfigField
                label="NSE Profile"
                value={
                  n.nse_profile_id ? `Profile #${n.nse_profile_id}` : "None"
                }
              />
              <ConfigField label="IPv6" value={n.is_ipv6 ? "Yes" : "No"} />
              {n.scanner_type === "greenbone" && (
                <>
                  <ConfigField
                    label="GVM Scan Config"
                    value={n.gvm_scan_config ?? "Full and fast"}
                  />
                  {n.gvm_port_list && (
                    <ConfigField
                      label="GVM Port List"
                      value={n.gvm_port_list}
                    />
                  )}
                  <ConfigField
                    label="Keep GVM Reports"
                    value={n.gvm_keep_reports ? "Yes" : "No"}
                  />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6 pt-4">
          {/* Core Scan Config */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-strong text-foreground mb-3">
              Scan Configuration
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <ConfigField label="Port Spec" value={n.port_spec} mono />
              <ConfigField
                label="Scan Rate"
                value={n.scan_rate != null ? `${n.scan_rate} pps` : "Default"}
              />
              <ConfigField
                label="Protocol"
                value={n.scan_protocol.toUpperCase()}
              />
              <ConfigField
                label="Schedule"
                value={n.scan_schedule ?? "Manual only"}
              />
              <ConfigField
                label="Schedule Active"
                value={n.scan_schedule_enabled ? "Yes" : "No"}
              />
              <ConfigField
                label="Scanner Type"
                value={n.scanner_type}
              />
              <ConfigField
                label="Scan Timeout"
                value={
                  n.scan_timeout != null
                    ? formatSeconds(n.scan_timeout)
                    : "Default"
                }
              />
              <ConfigField
                label="Port Timeout"
                value={
                  n.port_timeout != null
                    ? `${n.port_timeout} ms`
                    : "Default"
                }
              />
            </div>
          </div>

          {/* Nuclei Config (when enabled) */}
          {n.nuclei_enabled && (
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-5">
              <h3 className="text-sm font-strong text-foreground mb-3">
                Nuclei Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <ConfigField
                  label="Timeout"
                  value={
                    n.nuclei_timeout != null
                      ? formatSeconds(n.nuclei_timeout)
                      : "Default (30m)"
                  }
                />
                <ConfigField
                  label="Min Severity"
                  value={n.nuclei_severity ?? "All"}
                />
                <ConfigField
                  label="Tags"
                  value={n.nuclei_tags ?? "Default"}
                  mono
                />
                <ConfigField
                  label="Exclude Tags"
                  value={n.nuclei_exclude_tags ?? "None"}
                  mono
                />
                <ConfigField
                  label="SNI Fan-out"
                  value={n.nuclei_sni_enabled ? "Enabled" : "Disabled"}
                />
              </div>
            </div>
          )}

          {/* Port Rules */}
          <PortRulesEditor networkId={id} rules={ruleList} />
        </TabsContent>

        <TabsContent value="scans" className="space-y-6 pt-4">
          {/* Host Discovery */}
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
              <h3 className="text-sm font-strong text-foreground">
                Host Discovery
              </h3>
              <Button
                variant="outline"
                size="sm"
                disabled={triggerDiscovery.isPending}
                onClick={() =>
                  triggerDiscovery.mutate(id, {
                    onSuccess: () =>
                      toast.success("Host discovery scan triggered"),
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

          {/* Scan History */}
          <div className="rounded-lg border border-border">
            <div className="border-b border-border bg-card px-5 py-3">
              <h3 className="text-sm font-strong text-foreground">
                Scan History ({scanList.length})
              </h3>
            </div>
            {scanList.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No scans yet.
              </div>
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
        </TabsContent>
      </Tabs>

      <NetworkForm open={editOpen} onOpenChange={setEditOpen} network={n} />
    </div>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (seconds < 3600) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function PhasePill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-emphasis ${
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function ConfigField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
