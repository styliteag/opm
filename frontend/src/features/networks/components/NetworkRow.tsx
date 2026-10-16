import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { activeScanLabel } from "@/features/scans/lib/activeScans";
import type { Network, ScanListItem, ScanSummary } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  LAST_SCAN_DOT,
  LAST_SCAN_TEXT,
  engineName,
  formatTimeUntil,
  lastScanState,
  scanTypeLabel,
} from "../lib/networkLabels";
import { nextRunText } from "../lib/networkList";

interface NetworkRowProps {
  network: Network;
  lastScan: ScanSummary | null | undefined;
  /** Queued or running scan of this network, if any. */
  activeScan?: ScanListItem;
  canOperate: boolean;
  scanPending: boolean;
  onScanNow: (network: Network) => void;
}

function lastRunResult(scan: ScanSummary | null | undefined): string {
  if (!scan) return "Never";
  if (scan.status === "completed") return `${scan.port_count} open ports`;
  if (scan.status === "failed") return "Failed";
  if (scan.status === "cancelled") return "Cancelled";
  return "Running now";
}

/** One slim network row (UI v4): status, range, scan type, last/next run, Scan now. */
export function NetworkRow({
  network,
  lastScan,
  activeScan,
  canOperate,
  scanPending,
  onScanNow,
}: NetworkRowProps) {
  const navigate = useNavigate();
  const state = lastScanState(lastScan);
  const next = nextRunText(network, (iso) => formatTimeUntil(iso));
  const lastRunAt = lastScan?.completed_at ?? lastScan?.started_at;

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span
          role="img"
          aria-label={LAST_SCAN_TEXT[state]}
          title={LAST_SCAN_TEXT[state]}
          className={cn("h-2 w-2 shrink-0 rounded-full", LAST_SCAN_DOT[state])}
        />
        <div className="min-w-0">
          <Link
            to="/networks/$networkId"
            params={{ networkId: String(network.id) }}
            className="block truncate text-sm font-emphasis text-foreground hover:text-primary"
          >
            {network.name}
          </Link>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {network.cidr}
          </p>
        </div>
      </div>

      <div className="w-48 min-w-0 text-sm">
        <p className="truncate text-foreground">
          {scanTypeLabel(network.scanner_type)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {engineName(network.scanner_type)}
          {network.nuclei_enabled && " + nuclei"}
        </p>
      </div>

      <div className="w-52 text-sm">
        {activeScan ? (
          <>
            <Link
              to="/scans/$scanId"
              params={{ scanId: String(activeScan.id) }}
              className="block truncate text-primary hover:underline"
            >
              {activeScanLabel(activeScan)}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              Scan #{activeScan.id} in progress
            </p>
          </>
        ) : (
          <>
            <p
              className={cn(
                "truncate",
                state === "failed" ? "text-red-400" : "text-foreground",
              )}
            >
              {lastRunResult(lastScan)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {lastRunAt ? `Last run ${formatRelativeTime(lastRunAt)}` : "Not run yet"}
            </p>
          </>
        )}
      </div>

      <div className="w-28 text-sm">
        <p className="text-xs text-muted-foreground">Next run</p>
        <p
          className="truncate text-foreground"
          title={network.schedule_description ?? undefined}
        >
          {next}
        </p>
      </div>

      {canOperate && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={scanPending || activeScan !== undefined}
            title={activeScan ? "A scan of this network is already queued or running" : undefined}
            onClick={() => onScanNow(network)}
          >
            <Play />
            Scan now
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${network.name}`}
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() =>
                  void navigate({
                    to: "/networks/$networkId/edit",
                    params: { networkId: String(network.id) },
                  })
                }
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void navigate({
                    to: "/networks/new",
                    search: { clone: network.id },
                  })
                }
              >
                Clone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}
