import { PORT_STATUS, TOOL_LABELS } from "@/lib/terminology";
import type { ScanSummary } from "@/lib/types";
import { parseUTC } from "@/lib/utils";

/** Plain label per `scanner_type` (ADR 0010); the engine stays secondary. */
const SCAN_TYPE_LABELS: Record<string, string> = {
  masscan: TOOL_LABELS.masscan,
  nmap: TOOL_LABELS.nmap,
  greenbone: TOOL_LABELS.gvm,
  nse: TOOL_LABELS.nse,
};

const ENGINE_NAMES: Record<string, string> = {
  masscan: "masscan",
  nmap: "nmap",
  greenbone: "Greenbone / GVM",
  nse: "nmap NSE",
};

export function scanTypeLabel(scannerType: string): string {
  return SCAN_TYPE_LABELS[scannerType] ?? scannerType;
}

export function engineName(scannerType: string): string {
  return ENGINE_NAMES[scannerType] ?? scannerType;
}

/** Scanner default when `nuclei_timeout` is null (scanner/src/scanners/nuclei.py). */
export const DEFAULT_NUCLEI_TIMEOUT_MIN = 120;

export type LastScanState = "ok" | "failed" | "running" | "cancelled" | "never";

export function lastScanState(
  scan: { status: string } | null | undefined,
): LastScanState {
  if (!scan) return "never";
  switch (scan.status) {
    case "completed":
      return "ok";
    case "failed":
      return "failed";
    case "running":
    case "planned":
      return "running";
    default:
      return "cancelled";
  }
}

export const LAST_SCAN_TEXT: Record<LastScanState, string> = {
  ok: "Last scan OK",
  failed: "Last scan failed",
  running: "Scan running",
  cancelled: "Last scan cancelled",
  never: "Never scanned",
};

export const LAST_SCAN_DOT: Record<LastScanState, string> = {
  ok: "bg-emerald-500",
  failed: "bg-red-500",
  running: "bg-yellow-500",
  cancelled: "bg-muted-foreground",
  never: "bg-muted-foreground/50",
};

export function triggerLabel(trigger: string): string {
  return trigger === "scheduled" ? "Scheduled" : "Manual";
}

/** "in 2h 15m" until an ISO timestamp; null without one. */
export function formatTimeUntil(
  iso: string | null,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const minutes = Math.floor((parseUTC(iso).getTime() - now) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (seconds < 3600) return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export function formatDuration(
  scan: Pick<ScanSummary, "started_at" | "completed_at">,
): string | null {
  if (!scan.started_at || !scan.completed_at) return null;
  const ms =
    parseUTC(scan.completed_at).getTime() - parseUTC(scan.started_at).getTime();
  if (ms < 0) return null;
  return formatSeconds(Math.round(ms / 1000));
}

/** UI labels for port rule_type (glossary: Expected / Always critical). */
export const RULE_TYPE_LABELS: Record<"accepted" | "critical", string> = {
  accepted: PORT_STATUS.expected.label,
  critical: PORT_STATUS.critical.label,
};

export function ruleTarget(rule: {
  match_criteria: { ip?: string; port?: number };
}): string {
  const { ip, port } = rule.match_criteria;
  return `${ip ? `${ip}:` : ""}${port ?? "any port"}`;
}
