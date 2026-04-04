import type { ScanGroup } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface ScanPresenceChartProps {
  scanGroups: ScanGroup[];
}

function dotColor(group: ScanGroup): string {
  if (group.status === "cancelled") return "bg-border";
  if (group.port_seen) return "bg-primary";
  return "bg-muted-foreground opacity-30";
}

function dotTitle(group: ScanGroup): string {
  const id = group.scan_id != null ? `Scan #${group.scan_id}` : "Unknown scan";
  const date = group.started_at ? formatDate(group.started_at) : "Unknown date";
  const status = group.status ?? "unknown";
  return `${id} - ${date} - ${status}`;
}

export function ScanPresenceChart({ scanGroups }: ScanPresenceChartProps) {
  const MAX_DOTS = 30;
  const overflowCount =
    scanGroups.length > MAX_DOTS ? scanGroups.length - MAX_DOTS : 0;
  const displayGroups =
    overflowCount > 0 ? scanGroups.slice(-MAX_DOTS) : scanGroups;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-strong text-foreground mb-3">
        Scan Presence
      </h3>

      {scanGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scan data available</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {overflowCount > 0 && (
              <span className="text-xs text-muted-foreground mr-1">
                {overflowCount} earlier scans
              </span>
            )}
            {displayGroups.map((group, idx) => (
              <span
                key={group.scan_id ?? idx}
                className={`h-3 w-3 rounded-full inline-block ${dotColor(group)}`}
                title={dotTitle(group)}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" />
              Port seen
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground opacity-30 inline-block" />
              Not seen
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-border inline-block" />
              Cancelled
            </span>
          </div>
        </>
      )}
    </div>
  );
}
