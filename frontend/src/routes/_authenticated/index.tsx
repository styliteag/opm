import { createFileRoute } from "@tanstack/react-router";
import { Network, ShieldAlert, Monitor, Server } from "lucide-react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatCard } from "@/features/dashboard/components/StatCard";
import { ThreatPulseChart } from "@/features/dashboard/components/ThreatPulseChart";
import { RecentAlerts } from "@/features/dashboard/components/RecentAlerts";
import { ScannerStatus } from "@/features/dashboard/components/ScannerStatus";
import { ScanActivityCard } from "@/features/dashboard/components/ScanActivityCard";
import { UpcomingScans } from "@/features/dashboard/components/UpcomingScans";
import { NetworkCards } from "@/features/dashboard/components/NetworkCards";
import { parseUTC } from "@/lib/utils";
import {
  useNetworks,
  useScanners,
  useRecentAlerts,
  useActiveAlertCount,
  useTotalHostCount,
  useLatestScans,
  useAlertTrend,
} from "@/features/dashboard/hooks/useDashboardData";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

function DashboardPage() {
  const networks = useNetworks();
  const scanners = useScanners();
  const recentAlerts = useRecentAlerts(5);
  const alertCount = useActiveAlertCount();
  const hostCount = useTotalHostCount();
  const latestScans = useLatestScans();
  const alertTrend = useAlertTrend();

  const isLoading =
    networks.isLoading || scanners.isLoading || recentAlerts.isLoading;

  const error = networks.error || scanners.error || recentAlerts.error;

  if (isLoading) return <LoadingState rows={8} />;
  if (error)
    return (
      <ErrorState message={error.message} onRetry={() => networks.refetch()} />
    );

  const onlineScanners = (scanners.data?.scanners ?? []).filter(
    (s) =>
      s.last_seen_at &&
      new Date().getTime() - parseUTC(s.last_seen_at).getTime() < 5 * 60 * 1000,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Security Posture
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time oversight of organization-wide attack surface.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Alerts"
          value={alertCount.data ?? 0}
          icon={ShieldAlert}
          trend={
            alertCount.data !== undefined && alertCount.data >= 200
              ? "200+ alerts"
              : undefined
          }
        />
        <StatCard
          label="Networks"
          value={networks.data?.networks.length ?? 0}
          icon={Network}
        />
        <StatCard
          label="Scanners Online"
          value={`${onlineScanners}/${scanners.data?.scanners.length ?? 0}`}
          icon={Server}
        />
        <StatCard
          label="Total Hosts"
          value={hostCount.data?.toLocaleString() ?? "-"}
          icon={Monitor}
        />
      </div>

      {/* Threat Pulse Chart */}
      {alertTrend.data && <ThreatPulseChart data={alertTrend.data.data} />}

      {/* Bottom Grid: Recent Alerts + Scanner Status + Networks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentAlerts alerts={recentAlerts.data?.alerts ?? []} />
        </div>
        <div className="space-y-6">
          <ScannerStatus scanners={scanners.data?.scanners ?? []} />
          <ScanActivityCard
            latestScans={latestScans.data?.latest_scans ?? []}
          />
          <UpcomingScans networks={networks.data?.networks ?? []} />
          <NetworkCards
            networks={networks.data?.networks ?? []}
            latestScans={latestScans.data?.latest_scans ?? []}
          />
        </div>
      </div>
    </div>
  );
}
