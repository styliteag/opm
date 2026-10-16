import { SSH_ALERT_KEYS } from "@/features/admin/hooks/useAdmin";
import type { Network, ScanSummary } from "@/lib/types";

export type NetworkSortField = "name" | "next_run" | "last_run" | "scanner";
export type SortDir = "asc" | "desc";

export interface NetworkSortContext {
  latestScans: Map<number, ScanSummary | null>;
  scannerNames: Map<number, string>;
}

/** Empty values always sort last, whatever the direction. */
function compareOptional(a: string, b: string, dir: number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return dir * a.localeCompare(b);
}

function lastRunAt(scan: ScanSummary | null | undefined): string {
  return scan?.completed_at ?? scan?.started_at ?? "";
}

export function sortNetworks(
  networks: readonly Network[],
  field: NetworkSortField,
  dirName: SortDir,
  ctx: NetworkSortContext,
): Network[] {
  const dir = dirName === "asc" ? 1 : -1;
  return [...networks].sort((a, b) => {
    switch (field) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "next_run":
        return compareOptional(
          a.scan_schedule_enabled ? (a.next_fire_time ?? "") : "",
          b.scan_schedule_enabled ? (b.next_fire_time ?? "") : "",
          dir,
        );
      case "last_run":
        return compareOptional(
          lastRunAt(ctx.latestScans.get(a.id)),
          lastRunAt(ctx.latestScans.get(b.id)),
          dir,
        );
      case "scanner":
        return (
          dir *
          (ctx.scannerNames.get(a.scanner_id) ?? "").localeCompare(
            ctx.scannerNames.get(b.scanner_id) ?? "",
          )
        );
    }
  });
}

export function networkOverridesSsh(network: Network): boolean {
  const config = network.alert_config;
  if (!config) return false;
  return SSH_ALERT_KEYS.some((key) => key in config);
}

/** "Next run" cell: relative time, "Paused", or "Manual". */
export function nextRunText(
  network: Pick<Network, "scan_schedule" | "scan_schedule_enabled" | "next_fire_time">,
  formatUntil: (iso: string | null) => string | null,
): string {
  if (!network.scan_schedule) return "Manual";
  if (!network.scan_schedule_enabled) return "Paused";
  return formatUntil(network.next_fire_time) ?? "Scheduled";
}

/** Hidden scans stay out of the list unless asked for (inventory bug #10). */
export function visibleScans(
  scans: readonly ScanSummary[],
  showHidden: boolean,
): ScanSummary[] {
  return showHidden ? [...scans] : scans.filter((s) => !s.hidden);
}
