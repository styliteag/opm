import type { ScanListItem } from "@/lib/types";

/** "Running 45%", "Running" or "Queued" for a planned/running scan. */
export function activeScanLabel(scan: ScanListItem): string {
  if (scan.status === "planned") return "Queued";
  return scan.progress_percent != null
    ? `Running ${Math.round(scan.progress_percent)}%`
    : "Running";
}

/** One active scan per network; a running scan wins over a queued one. */
export function activeScansByNetwork(
  scans: ScanListItem[],
): Map<number, ScanListItem> {
  const byNetwork = new Map<number, ScanListItem>();
  for (const scan of scans) {
    const current = byNetwork.get(scan.network_id);
    if (!current || (current.status !== "running" && scan.status === "running")) {
      byNetwork.set(scan.network_id, scan);
    }
  }
  return byNetwork;
}
