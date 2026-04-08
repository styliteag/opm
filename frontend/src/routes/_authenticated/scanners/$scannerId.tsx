import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, Clock, Network, ScanLine } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-display/DataTable";
import { StatCard } from "@/features/dashboard/components/StatCard";
import { useScannerDetail } from "@/features/scanners/hooks/useScanners";
import { formatRelativeTime, isOnline, scanStatusVariant } from "@/lib/utils";
import type { ScannerNetworkInfo, ScannerScanSummary } from "@/lib/types";

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
      </Tabs>
    </div>
  );
}
