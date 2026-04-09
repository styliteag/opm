import { Link } from "@tanstack/react-router";

import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { Badge } from "@/components/ui/badge";
import type { HostAlertSummary } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export function HostAlertsTab({ alerts }: { alerts: HostAlertSummary[] }) {
  return (
    <div className="rounded-lg border border-border">
      {alerts.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No active alerts
        </div>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map((alert) => (
            <Link
              key={alert.id}
              to="/alerts/$alertId"
              params={{ alertId: String(alert.id) }}
              className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors"
            >
              <SeverityBadge
                severity={
                  alert.severity as "critical" | "high" | "medium" | "info"
                }
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {alert.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  Port {alert.port} · {alert.network_name ?? "Unknown network"}
                </p>
              </div>
              {alert.dismissed && (
                <Badge variant="outline" className="text-xs">
                  Dismissed
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(alert.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
