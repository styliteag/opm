import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Inbox, Server } from "lucide-react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { Button } from "@/components/ui/button";
import { ThreatPulseChart } from "@/features/dashboard/components/ThreatPulseChart";
import { ScannerStatus } from "@/features/dashboard/components/ScannerStatus";
import { ScanActivityCard } from "@/features/dashboard/components/ScanActivityCard";
import { UpcomingScans } from "@/features/dashboard/components/UpcomingScans";
import { StatCard } from "@/features/dashboard/components/StatCard";
import { useAlerts } from "@/features/alerts/hooks/useAlerts";
import {
  useNetworks,
  useScanners,
  useLatestScans,
  useAlertTrend,
} from "@/features/dashboard/hooks/useDashboardData";
import { HomePrototype } from "@/features/prototype-v4/home/HomePrototype";
import type { Severity } from "@/lib/types";
import { cn, parseUTC } from "@/lib/utils";

// PROTOTYPE (UI v4): ?variant=A|B|C swaps in the Home prototypes; remove after decision.
export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): { variant?: string } => ({
    variant: typeof search.variant === "string" ? search.variant : undefined,
  }),
  component: HomeRoute,
});

function HomeRoute() {
  const { variant } = Route.useSearch();
  return variant ? <HomePrototype variant={variant} /> : <DashboardPage />;
}

const SEVERITY_STYLES: Record<Severity, { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "Critical" },
  high: { dot: "bg-orange-500", label: "High" },
  medium: { dot: "bg-yellow-500", label: "Medium" },
  info: { dot: "bg-blue-500", label: "Info" },
};

function DashboardPage() {
  const networks = useNetworks();
  const scanners = useScanners();
  const latestScans = useLatestScans();
  const alertTrend = useAlertTrend();
  // severity_counts and total for the open queue; the page itself is unused
  const openAlerts = useAlerts({ queue_state: "inbox", limit: 1 });

  const isLoading =
    networks.isLoading || scanners.isLoading || openAlerts.isLoading;
  const error = networks.error || scanners.error || openAlerts.error;

  if (isLoading) return <LoadingState rows={8} />;
  if (error)
    return (
      <ErrorState message={error.message} onRetry={() => networks.refetch()} />
    );

  const openTotal = openAlerts.data?.total ?? 0;
  const severityCounts = openAlerts.data?.severity_counts ?? {};

  const scannerList = scanners.data?.scanners ?? [];
  const onlineScanners = scannerList.filter(
    (s) =>
      s.last_seen_at &&
      new Date().getTime() - parseUTC(s.last_seen_at).getTime() < 5 * 60 * 1000,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-strong text-foreground">Triage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openTotal === 0
              ? "Inbox zero — no open alerts need a decision."
              : `${openTotal} open ${openTotal === 1 ? "alert needs" : "alerts need"} a decision.`}
          </p>
        </div>
        <Link to="/alerts">
          <Button>
            <Inbox className="mr-1.5 h-4 w-4" />
            Open Inbox
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Open alerts by severity — the triage queue at a glance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {(["critical", "high", "medium", "info"] as const).map((sev) => (
          <Link
            key={sev}
            to="/alerts"
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  SEVERITY_STYLES[sev].dot,
                )}
              />
              <span className="text-xs text-muted-foreground">
                {SEVERITY_STYLES[sev].label}
              </span>
            </div>
            <p className="mt-2 text-2xl font-strong text-foreground">
              {severityCounts[sev] ?? 0}
            </p>
          </Link>
        ))}
        <StatCard
          label="Scanners Online"
          value={`${onlineScanners}/${scannerList.length}`}
          icon={Server}
        />
      </div>

      {/* 30-day trend */}
      {alertTrend.data && <ThreatPulseChart data={alertTrend.data.data} />}

      {/* Operational status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ScannerStatus scanners={scannerList} />
        <ScanActivityCard latestScans={latestScans.data?.latest_scans ?? []} />
        <UpcomingScans networks={networks.data?.networks ?? []} />
      </div>
    </div>
  );
}
