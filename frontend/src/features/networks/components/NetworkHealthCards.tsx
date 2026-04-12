import { CheckCircle, Globe, Monitor, Shield, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { StatCard } from "@/features/dashboard/components/StatCard";
import type { NetworkOverviewResponse } from "@/lib/types";

interface NetworkHealthCardsProps {
  overview: NetworkOverviewResponse;
}

export function NetworkHealthCards({ overview }: NetworkHealthCardsProps) {
  const successPct = Math.round(overview.scan_success_rate * 100);
  const nucleiEnabled = overview.network.nuclei_enabled;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hosts" value={overview.host_count} icon={Monitor} />
        <StatCard
          label="Active Alerts"
          value={overview.active_alert_count}
          icon={ShieldAlert}
          trend={
            Object.keys(overview.alert_severity_distribution).length > 0
              ? Object.entries(overview.alert_severity_distribution)
                  .map(([sev, count]) => `${count} ${sev}`)
                  .join(", ")
              : undefined
          }
        />
        <StatCard
          label="Open Ports"
          value={overview.open_port_count}
          icon={Globe}
        />
        <StatCard
          label="Scan Success"
          value={`${successPct}%`}
          icon={CheckCircle}
          trend={`${overview.completed_scans_30d}/${overview.total_scans_30d} scans (30d)`}
        />
      </div>
      {nucleiEnabled && (
        <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-teal-300" />
              <span className="text-sm font-emphasis text-teal-300">
                Nuclei
              </span>
              <span className="text-sm text-foreground">
                {overview.nuclei_findings_count === 0
                  ? "No findings"
                  : `${overview.nuclei_findings_count} finding${overview.nuclei_findings_count === 1 ? "" : "s"}`}
              </span>
            </div>
            {overview.last_nuclei_scan_id && (
              <Link
                to="/scans/$scanId"
                params={{ scanId: String(overview.last_nuclei_scan_id) }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View scan →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
