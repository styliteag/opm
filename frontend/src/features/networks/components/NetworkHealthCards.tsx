import { CheckCircle, Globe, Monitor, ShieldAlert } from "lucide-react";

import { StatCard } from "@/features/dashboard/components/StatCard";
import type { NetworkOverviewResponse } from "@/lib/types";

interface NetworkHealthCardsProps {
  overview: NetworkOverviewResponse;
}

export function NetworkHealthCards({ overview }: NetworkHealthCardsProps) {
  const successPct = Math.round(overview.scan_success_rate * 100);

  return (
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
  );
}
