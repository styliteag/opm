import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import type { LatestScanEntry } from "@/lib/types";
import { getScanDisplayTime, scanStatusVariant } from "@/lib/utils";

interface ScanActivityCardProps {
  latestScans: LatestScanEntry[];
}

export function ScanActivityCard({ latestScans }: ScanActivityCardProps) {
  const recentScans = latestScans
    .filter((s) => s.scan !== null)
    .sort((a, b) => {
      const aTime = a.scan?.completed_at ?? a.scan?.started_at ?? "";
      const bTime = b.scan?.completed_at ?? b.scan?.started_at ?? "";
      return bTime.localeCompare(aTime);
    })
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Scan Activity</CardTitle>
        <Link
          to="/scans"
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentScans.length === 0 && (
          <p className="text-sm text-muted-foreground">No recent scans</p>
        )}
        {recentScans.map((entry) => {
          const scan = entry.scan!;
          return (
            <Link
              key={scan.id}
              to="/scans/$scanId"
              params={{ scanId: String(scan.id) }}
              className="flex items-center justify-between rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
            >
              <div>
                <p className="text-sm text-foreground">
                  {scan.port_count} ports · {scan.trigger_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getScanDisplayTime(scan)}
                </p>
              </div>
              <StatusBadge
                label={scan.status}
                variant={scanStatusVariant(scan.status)}
                dot
              />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
