import { Link } from "@tanstack/react-router";

import type { NetworkOverviewResponse } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import {
  LAST_SCAN_DOT,
  LAST_SCAN_TEXT,
  formatDuration,
  formatTimeUntil,
  lastScanState,
} from "../../lib/networkLabels";

function Tile({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string | number;
  tone?: "warn" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-strong tabular-nums",
          tone === "danger"
            ? "text-red-400"
            : tone === "warn"
              ? "text-yellow-400"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

/** Counts derived from the overview + the alert inbox (same rules as Home). */
export function NetworkStatusSummary({
  overview,
}: {
  overview: NetworkOverviewResponse;
}) {
  const n = overview.network;
  const status = useNetworkStatus(n.id);
  const last = overview.last_scan;
  const state = lastScanState(last);
  const lastAt = last?.completed_at ?? last?.started_at;
  const duration = last ? formatDuration(last) : null;
  const next = n.scan_schedule_enabled ? formatTimeUntil(n.next_fire_time) : null;
  const more = status.truncated ? "+" : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span className={cn("h-2 w-2 rounded-full", LAST_SCAN_DOT[state])} />
          {LAST_SCAN_TEXT[state]}
          {lastAt && (
            <span className="text-muted-foreground">
              {formatRelativeTime(lastAt)}
              {duration && ` · took ${duration}`}
            </span>
          )}
        </span>
        {next && <span className="text-muted-foreground">Next run {next}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Hosts" value={overview.host_count}>
          <Link
            to="/ports"
            search={{ tab: "hosts", network_id: n.id }}
            className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            View hosts →
          </Link>
        </Tile>
        <Tile label="Open ports" value={overview.open_port_count} />
        <Tile
          label="Ports to review"
          value={status.isLoading ? "…" : `${status.portsToReview}${more}`}
          tone={status.portsToReview > 0 ? "warn" : undefined}
        >
          {status.portsToReview > 0 && (
            <Link
              to="/"
              className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground"
            >
              Review on Home →
            </Link>
          )}
        </Tile>
        <Tile
          label="Important findings"
          value={status.isLoading ? "…" : `${status.importantFindings}${more}`}
          tone={status.importantFindings > 0 ? "danger" : undefined}
        />
      </div>
    </div>
  );
}
