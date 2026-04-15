import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Play, Copy, X, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

import type { Network, ScanSummary } from "@/lib/types";

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
import { PhasePills } from "@/features/networks/components/PhasePills";
import { SSH_ALERT_KEYS } from "@/features/admin/hooks/useAdmin";
import {
  formatRelativeTime,
  isOnline,
  parseUTC,
  scanStatusVariant,
} from "@/lib/utils";

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

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "-";
  const ms = parseUTC(completedAt).getTime() - parseUTC(startedAt).getTime();
  if (ms < 0) return "-";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatTimeout(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function formatTimeUntil(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type SortField = "name" | "next_run" | "last_run" | "scanner";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "next_run", label: "Next Run" },
  { field: "last_run", label: "Last Run" },
  { field: "scanner", label: "Scanner" },
];

function networkOverridesSsh(network: Network): boolean {
  const config = network.alert_config as Record<string, unknown> | null;
  if (!config) return false;
  return SSH_ALERT_KEYS.some((key) => key in config);
}

function NetworksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<Network | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const navigate = Route.useNavigate();
  const { filter } = Route.useSearch();
  const networks = useNetworks();
  const scanners = useScanners();
  const latestScans = useLatestScans();
  const { triggerScan, update } = useNetworkMutations();

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

  const allNetworks = useMemo(
    () => networks.data?.networks ?? [],
    [networks.data],
  );
  const networkList = useMemo(
    () =>
      filter === "ssh-override"
        ? allNetworks.filter(networkOverridesSsh)
        : allNetworks,
    [allNetworks, filter],
  );

  const stats = useMemo(() => {
    const scheduled = allNetworks.filter((n) => n.scan_schedule && n.scan_schedule_enabled).length;
    const lastCompleted = allNetworks.filter((n) => scanMap.get(n.id)?.status === "completed").length;
    const failing = allNetworks.filter((n) => {
      const s = scanMap.get(n.id);
      return s && s.status === "failed";
    }).length;
    return { total: allNetworks.length, scheduled, lastCompleted, failing };
  }, [allNetworks, scanMap]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedList = useMemo(() => {
    const list = [...networkList];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "next_run": {
          const ta = a.next_fire_time ?? "";
          const tb = b.next_fire_time ?? "";
          if (!ta && !tb) return 0;
          if (!ta) return 1;
          if (!tb) return -1;
          return dir * ta.localeCompare(tb);
        }
        case "last_run": {
          const sa = scanMap.get(a.id);
          const sb = scanMap.get(b.id);
          const da = sa?.completed_at ?? sa?.started_at ?? "";
          const db = sb?.completed_at ?? sb?.started_at ?? "";
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return dir * da.localeCompare(db);
        }
        case "scanner": {
          const na = scannerMap.get(a.scanner_id)?.name ?? "";
          const nb = scannerMap.get(b.scanner_id)?.name ?? "";
          return dir * na.localeCompare(nb);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [networkList, sortField, sortDir, scanMap, scannerMap]);

  if (networks.isLoading) return <LoadingState rows={6} />;
  if (networks.error)
    return (
      <ErrorState
        message={networks.error.message}
        onRetry={() => networks.refetch()}
      />
    );

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
            Network Summary
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-strong text-foreground">
                {stats.total}
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="text-2xl font-strong text-foreground">
                {stats.scheduled}
              </p>
              <p className="text-xs text-muted-foreground">Scheduled</p>
            </div>
            <div>
              <p className="text-2xl font-strong text-foreground">
                {stats.lastCompleted}
              </p>
              <p className="text-xs text-muted-foreground">Last OK</p>
            </div>
            <div>
              <p className={`text-2xl font-strong ${stats.failing > 0 ? "text-red-400" : "text-foreground"}`}>
                {stats.failing}
              </p>
              <p className="text-xs text-muted-foreground">Last Failed</p>
            </div>
          </div>
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
            title="Remove filter"
          >
            SSH override active
            <X className="h-3 w-3" />
          </button>
          <span className="text-xs text-muted-foreground">
            {networkList.length} of {allNetworks.length} networks
          </span>
        </div>
      )}

      {/* Sort Bar */}
      {networkList.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Sort:</span>
          {SORT_OPTIONS.map((opt) => {
            const active = sortField === opt.field;
            return (
              <button
                key={opt.field}
                type="button"
                onClick={() => toggleSort(opt.field)}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
                }`}
              >
                {opt.label}
                {active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
              </button>
            );
          })}
        </div>
      )}

      {/* Network Cards */}
      {networkList.length === 0 ? (
        <EmptyState
          title={
            filter === "ssh-override"
              ? "No networks with SSH override"
              : "No networks"
          }
          message={
            filter === "ssh-override"
              ? "No network currently overrides the global SSH defaults."
              : "Add a network to start scanning."
          }
        />
      ) : (
        <div className="space-y-4">
          {sortedList.map((network) => {
            const scan = scanMap.get(network.id) as ScanSummary | undefined;
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
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          update.mutate(
                            { id: network.id, scan_schedule_enabled: !network.scan_schedule_enabled },
                            {
                              onSuccess: () =>
                                toast.success(
                                  network.scan_schedule_enabled
                                    ? `Schedule paused for ${network.name}`
                                    : `Schedule resumed for ${network.name}`,
                                ),
                              onError: (err) => toast.error(err.message),
                            },
                          );
                        }}
                        className="cursor-pointer"
                        title={network.scan_schedule_enabled ? "Click to pause schedule" : "Click to resume schedule"}
                      >
                        <StatusBadge
                          label={network.scan_schedule_enabled ? "Scheduled" : "Paused"}
                          variant={network.scan_schedule_enabled ? "success" : "warning"}
                        />
                      </button>
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

                {/* Phases + Config */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="text-quaternary">Phases:</span>
                    <PhasePills
                      network={network}
                      disabled={update.isPending}
                      onToggle={(patch) =>
                        update.mutate(
                          { id: network.id, ...patch },
                          {
                            onSuccess: () =>
                              toast.success(`Updated ${network.name}`),
                            onError: (e) =>
                              toast.error(
                                e instanceof Error
                                  ? e.message
                                  : "Failed to update network",
                              ),
                          },
                        )
                      }
                    />
                  </span>
                  <span>
                    <span className="text-quaternary">Scan timeout:</span>{" "}
                    <span className="text-foreground">
                      {formatTimeout(network.scan_timeout)}
                    </span>
                  </span>
                  {network.nuclei_enabled && network.nuclei_timeout != null && (
                    <span>
                      <span className="text-quaternary">Nuclei timeout:</span>{" "}
                      <span className="text-foreground">
                        {formatTimeout(network.nuclei_timeout)}
                      </span>
                    </span>
                  )}
                  <span>
                    <span className="text-quaternary">Scanner:</span>{" "}
                    <span className="text-foreground">
                      {scanner?.name ?? "-"}
                    </span>
                  </span>
                </div>

                {/* Last Run Info */}
                <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-6">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Port Spec</p>
                    <p className="text-sm text-foreground truncate" title={network.port_spec}>
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
                    <p className="text-xs text-muted-foreground">Last Status</p>
                    <p className="text-sm">
                      {scan ? (
                        <StatusBadge
                          label={scan.status}
                          variant={scanStatusVariant(scan.status)}
                          dot
                        />
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Run</p>
                    <p className="text-sm text-foreground">
                      {scan?.completed_at
                        ? formatRelativeTime(scan.completed_at)
                        : scan?.started_at
                          ? formatRelativeTime(scan.started_at)
                          : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Duration / Ports
                    </p>
                    <p className="text-sm text-foreground">
                      {scan?.status === "completed"
                        ? `${formatDuration(scan.started_at, scan.completed_at)} · ${scan.port_count} ports`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Schedule</p>
                    <p className="text-sm text-foreground truncate" title={network.schedule_description ?? undefined}>
                      {network.schedule_description ?? "Manual"}
                    </p>
                    {network.next_fire_time && (
                      <p className="text-[10px] text-muted-foreground">
                        Next: {formatTimeUntil(network.next_fire_time)}
                      </p>
                    )}
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
