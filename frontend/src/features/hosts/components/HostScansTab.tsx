import { Link } from "@tanstack/react-router";

import { StatusBadge } from "@/components/data-display/StatusBadge";
import type { HostScanEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export function HostScansTab({ scans }: { scans: HostScanEntry[] }) {
  return (
    <div className="rounded-lg border border-border">
      {scans.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No scan history
        </div>
      ) : (
        <div className="divide-y divide-border">
          {scans.map((scan) => (
            <Link
              key={scan.id}
              to="/scans/$scanId"
              params={{ scanId: String(scan.id) }}
              className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
            >
              <div>
                <p className="text-sm text-foreground">
                  {scan.network_name ?? `Network #${scan.network_id}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {scan.port_count} ports · {scan.trigger_type}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={scan.status}
                  variant={
                    scan.status === "completed"
                      ? "success"
                      : scan.status === "running"
                        ? "warning"
                        : scan.status === "error"
                          ? "danger"
                          : "neutral"
                  }
                  dot
                />
                {scan.completed_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(scan.completed_at)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
