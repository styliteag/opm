import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import type { LatestScanEntry, Network } from "@/lib/types";
import { getScanDisplayTime, scanStatusVariant } from "@/lib/utils";

interface NetworkCardsProps {
  networks: Network[];
  latestScans: LatestScanEntry[];
}

export function NetworkCards({ networks, latestScans }: NetworkCardsProps) {
  const scanMap = new Map(latestScans.map((s) => [s.network_id, s.scan]));

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Networks</CardTitle>
        <Link
          to="/networks"
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {networks.map((network) => {
          const scan = scanMap.get(network.id);
          return (
            <Link
              key={network.id}
              to="/networks/$networkId"
              params={{ networkId: String(network.id) }}
              className="flex items-center justify-between rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors"
            >
              <div>
                <p className="text-sm text-foreground">{network.name}</p>
                <p className="text-xs text-muted-foreground">{network.cidr}</p>
              </div>
              <div className="text-right">
                {scan ? (
                  <>
                    <StatusBadge
                      label={scan.status}
                      variant={scanStatusVariant(scan.status)}
                      dot
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {getScanDisplayTime(scan)}
                    </p>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No scans
                  </span>
                )}
              </div>
            </Link>
          );
        })}
        {networks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No networks configured
          </p>
        )}
      </CardContent>
    </Card>
  );
}
