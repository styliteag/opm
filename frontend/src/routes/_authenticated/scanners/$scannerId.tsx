import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Network,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-display/DataTable";
import { StatCard } from "@/features/dashboard/components/StatCard";
import {
  useLibraryEntries,
  useScannerMirror,
  useScannerRefreshMutation,
} from "@/features/gvm-library/hooks/useGvmLibrary";
import { useScannerDetail } from "@/features/scanners/hooks/useScanners";
import { formatRelativeTime, isOnline, scanStatusVariant } from "@/lib/utils";
import type {
  GvmKind,
  GvmLibraryEntry,
  GvmScannerMetadataEntry,
  ScannerNetworkInfo,
  ScannerScanSummary,
} from "@/lib/types";

export const Route = createFileRoute("/_authenticated/scanners/$scannerId")({
  component: ScannerDetailPage,
});

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

const networkColumns: DataTableColumn<ScannerNetworkInfo>[] = [
  {
    key: "name",
    header: "Name",
    render: (n) => (
      <Link
        to="/networks/$networkId"
        params={{ networkId: String(n.id) }}
        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        {n.name}
      </Link>
    ),
  },
  {
    key: "cidr",
    header: "CIDR",
    render: (n) => (
      <span className="font-mono text-sm text-muted-foreground">{n.cidr}</span>
    ),
  },
  {
    key: "schedule",
    header: "Schedule",
    render: (n) => (
      <span className="text-sm text-muted-foreground">
        {n.scan_schedule ?? "Manual"}
      </span>
    ),
  },
];

const scanColumns: DataTableColumn<ScannerScanSummary>[] = [
  {
    key: "network",
    header: "Network",
    render: (s) => (
      <Link
        to="/networks/$networkId"
        params={{ networkId: String(s.network_id) }}
        className="text-sm text-foreground hover:text-primary transition-colors"
      >
        {s.network_name}
      </Link>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (s) => (
      <StatusBadge label={s.status} variant={scanStatusVariant(s.status)} dot />
    ),
  },
  {
    key: "trigger",
    header: "Trigger",
    render: (s) => (
      <span className="text-sm text-muted-foreground">{s.trigger_type}</span>
    ),
  },
  {
    key: "ports",
    header: "Ports",
    render: (s) => (
      <span className="text-sm font-mono text-muted-foreground">
        {s.port_count}
      </span>
    ),
  },
  {
    key: "duration",
    header: "Duration",
    render: (s) => (
      <span className="text-sm text-muted-foreground">
        {formatDuration(s.duration_seconds)}
      </span>
    ),
  },
  {
    key: "completed",
    header: "Completed",
    render: (s) => (
      <span className="text-sm text-muted-foreground">
        {s.completed_at ? formatRelativeTime(s.completed_at) : "-"}
      </span>
    ),
  },
];

function ScannerDetailPage() {
  const { scannerId } = Route.useParams();
  const id = Number(scannerId);
  const { data, isLoading, error, refetch } = useScannerDetail(id);

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Scanner not found" />;

  const s = data.scanner;
  const online = isOnline(s.last_seen_at);
  const successRate =
    data.total_scans > 0
      ? Math.round((data.completed_scans / data.total_scans) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/scanners"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-strong text-foreground">{s.name}</h1>
          <div className="mt-0.5 flex items-center gap-3">
            {s.description && (
              <span className="text-sm text-muted-foreground">
                {s.description}
              </span>
            )}
            <StatusBadge
              label={online ? "Online" : "Offline"}
              variant={online ? "success" : "danger"}
              dot
            />
            {s.scanner_version && (
              <span className="text-xs text-muted-foreground">
                v{s.scanner_version}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Networks"
          value={data.networks.length}
          icon={Network}
        />
        <StatCard
          label="Total Scans"
          value={data.total_scans}
          icon={ScanLine}
          trend={`${data.scans_last_24h} today · ${data.scans_last_7d} this week`}
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={CheckCircle}
          trend={`${data.completed_scans} completed · ${data.failed_scans} failed`}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(data.avg_scan_duration_seconds)}
          icon={Clock}
          trend={
            s.last_seen_at
              ? `Last seen ${formatRelativeTime(s.last_seen_at)}`
              : "Never seen"
          }
        />
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="networks">
        <TabsList variant="line">
          <TabsTrigger value="networks">
            Networks ({data.networks.length})
          </TabsTrigger>
          <TabsTrigger value="scans">
            Recent Scans ({data.recent_scans.length})
          </TabsTrigger>
          {s.kind === "gvm" && (
            <>
              <TabsTrigger value="gvm_scan_configs">GVM Scan Configs</TabsTrigger>
              <TabsTrigger value="gvm_port_lists">GVM Port Lists</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="networks" className="pt-4">
          {data.networks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No networks assigned to this scanner.
            </p>
          ) : (
            <DataTable
              columns={networkColumns}
              rows={data.networks}
              rowKey={(n) => n.id}
            />
          )}
        </TabsContent>

        <TabsContent value="scans" className="pt-4">
          {data.recent_scans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No scans recorded for this scanner.
            </p>
          ) : (
            <DataTable
              columns={scanColumns}
              rows={data.recent_scans}
              rowKey={(s) => s.id}
            />
          )}
        </TabsContent>

        {s.kind === "gvm" && (
          <>
            <TabsContent value="gvm_scan_configs" className="pt-4">
              <GvmMirrorTab scannerId={id} kind="scan_config" />
            </TabsContent>
            <TabsContent value="gvm_port_lists" className="pt-4">
              <GvmMirrorTab scannerId={id} kind="port_list" />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface GvmMirrorTabProps {
  scannerId: number;
  kind: GvmKind;
}

type MirrorStatus =
  | "installed"
  | "update_pending"
  | "will_deploy"
  | "unmanaged";

function computeStatus(
  entry: GvmScannerMetadataEntry | undefined,
  libraryEntry: GvmLibraryEntry | undefined,
): MirrorStatus {
  if (!entry && libraryEntry) return "will_deploy";
  if (!libraryEntry) return entry?.is_builtin ? "installed" : "unmanaged";
  if (!entry) return "will_deploy";
  return entry.xml_hash === libraryEntry.xml_hash
    ? "installed"
    : "update_pending";
}

function statusVariant(status: MirrorStatus) {
  switch (status) {
    case "installed":
      return "success" as const;
    case "update_pending":
      return "warning" as const;
    case "will_deploy":
      return "neutral" as const;
    case "unmanaged":
      return "neutral" as const;
  }
}

function statusLabel(status: MirrorStatus): string {
  switch (status) {
    case "installed":
      return "installed";
    case "update_pending":
      return "update pending";
    case "will_deploy":
      return "will deploy";
    case "unmanaged":
      return "unmanaged";
  }
}

function GvmMirrorTab({ scannerId, kind }: GvmMirrorTabProps) {
  const mirror = useScannerMirror(scannerId, kind);
  const library = useLibraryEntries(kind);
  const refresh = useScannerRefreshMutation(scannerId);

  if (mirror.isLoading) return <LoadingState rows={4} />;
  if (mirror.error) {
    return (
      <ErrorState message={mirror.error.message} onRetry={mirror.refetch} />
    );
  }

  const entries = mirror.data?.entries ?? [];
  const libraryByName = new Map<string, GvmLibraryEntry>();
  for (const entry of library.data?.entries ?? []) {
    libraryByName.set(entry.name, entry);
  }

  // Merge library entries that aren't on the scanner yet (status = will_deploy)
  const namesInMirror = new Set(entries.map((e) => e.name));
  const libraryOnly = (library.data?.entries ?? []).filter(
    (e) => !namesInMirror.has(e.name),
  );

  const handleRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: () => toast.success("Refresh requested"),
      onError: (err: Error) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {mirror.data?.gvm_synced_at
            ? `Last synced ${formatRelativeTime(mirror.data.gvm_synced_at)}`
            : "Never synced"}
          {mirror.data?.gvm_refresh_requested && " · refresh pending..."}
        </p>
        <button
          onClick={handleRefresh}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`}
          />
          Refresh metadata
        </button>
      </div>

      {entries.length === 0 && libraryOnly.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No {kind === "scan_config" ? "scan configs" : "port lists"} known for
          this scanner. Trigger a refresh to fetch live state.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-emphasis">Name</th>
                <th className="px-4 py-2 text-left font-emphasis">Source</th>
                <th className="px-4 py-2 text-left font-emphasis">
                  Installed
                </th>
                <th className="px-4 py-2 text-left font-emphasis">Library</th>
                <th className="px-4 py-2 text-left font-emphasis">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const libraryEntry = libraryByName.get(entry.name);
                const status = computeStatus(entry, libraryEntry);
                const source = libraryEntry
                  ? "Library"
                  : entry.is_builtin
                    ? "Built-in"
                    : "Unmanaged";
                return (
                  <tr
                    key={`mirror-${entry.id}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-4 py-2 font-emphasis text-foreground">
                      {entry.name}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {source}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {entry.xml_hash ? entry.xml_hash.slice(0, 8) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {libraryEntry ? libraryEntry.xml_hash.slice(0, 8) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={statusLabel(status)}
                        variant={statusVariant(status)}
                        dot
                      />
                    </td>
                  </tr>
                );
              })}
              {libraryOnly.map((libraryEntry) => {
                const status = computeStatus(undefined, libraryEntry);
                return (
                  <tr
                    key={`lib-${libraryEntry.id}`}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-4 py-2 font-emphasis text-foreground">
                      {libraryEntry.name}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      Library
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      —
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {libraryEntry.xml_hash.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge
                        label={statusLabel(status)}
                        variant={statusVariant(status)}
                        dot
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
