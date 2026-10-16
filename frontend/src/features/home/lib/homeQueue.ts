import type { Alert, LatestScanEntry, Scanner, Severity } from "@/lib/types";
import { parseUTC } from "@/lib/utils";

/** One Home queue row: every open port alert for the same IP:port (ADR 0012). */
export interface PortGroup {
  key: string;
  ip: string;
  port: number;
  hostId: number | null;
  hostname: string | null;
  severity: Severity;
  networks: string[];
  alerts: Alert[];
  alertIds: number[];
  newestAt: string;
  why: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  info: 0,
};

const OFFLINE_AFTER_MS = 5 * 60 * 1000;

export function effectiveSeverity(alert: Alert): Severity {
  return alert.severity_override ?? alert.severity;
}

export function isImportantSeverity(severity: Severity): boolean {
  return severity === "critical" || severity === "high";
}

function addToGroup(group: PortGroup, alert: Alert): PortGroup {
  const severity = effectiveSeverity(alert);
  return {
    ...group,
    hostId: group.hostId ?? alert.host_id,
    hostname: group.hostname ?? alert.hostname,
    severity:
      SEVERITY_RANK[severity] > SEVERITY_RANK[group.severity]
        ? severity
        : group.severity,
    networks:
      alert.network_name && !group.networks.includes(alert.network_name)
        ? [...group.networks, alert.network_name]
        : group.networks,
    alerts: [...group.alerts, alert],
    alertIds: [...group.alertIds, alert.id],
    newestAt: alert.created_at > group.newestAt ? alert.created_at : group.newestAt,
    why: group.why ?? alert.user_comment,
  };
}

function newGroup(alert: Alert, port: number): PortGroup {
  return {
    key: `${alert.ip}:${port}`,
    ip: alert.ip,
    port,
    hostId: alert.host_id,
    hostname: alert.hostname,
    severity: effectiveSeverity(alert),
    networks: alert.network_name ? [alert.network_name] : [],
    alerts: [alert],
    alertIds: [alert.id],
    newestAt: alert.created_at,
    why: alert.user_comment,
  };
}

/** Group port alerts by IP:port across networks; highest severity, then newest, first. */
export function groupPortAlerts(alerts: readonly Alert[]): PortGroup[] {
  const groups = new Map<string, PortGroup>();
  for (const alert of alerts) {
    if (alert.source !== "port" || alert.port == null) continue;
    const key = `${alert.ip}:${alert.port}`;
    const existing = groups.get(key);
    groups.set(key, existing ? addToGroup(existing, alert) : newGroup(alert, alert.port));
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.newestAt.localeCompare(a.newestAt),
  );
}

/** Findings shown on Home: non-port alerts at high or critical (ADR 0013). */
export function importantFindings(alerts: readonly Alert[]): Alert[] {
  return alerts
    .filter(
      (a) => a.source !== "port" && isImportantSeverity(effectiveSeverity(a)),
    )
    .sort(
      (a, b) =>
        SEVERITY_RANK[effectiveSeverity(b)] -
          SEVERITY_RANK[effectiveSeverity(a)] ||
        b.created_at.localeCompare(a.created_at),
    );
}

/** Names of scanners not seen within five minutes (same rule as the v3 dashboard). */
export function offlineScanners(
  scanners: readonly Scanner[],
  now: number = Date.now(),
): string[] {
  return scanners
    .filter(
      (s) =>
        !s.last_seen_at ||
        now - parseUTC(s.last_seen_at).getTime() >= OFFLINE_AFTER_MS,
    )
    .map((s) => s.name);
}

export interface FailedNetworkScan {
  networkId: number;
  name: string;
  scanId: number;
  error: string | null;
}

/** Networks whose latest scan failed. */
export function failedNetworkScans(
  entries: readonly LatestScanEntry[],
  networkNames: ReadonlyMap<number, string>,
): FailedNetworkScan[] {
  return entries.flatMap((entry) =>
    entry.scan?.status === "failed"
      ? [
          {
            networkId: entry.network_id,
            name: networkNames.get(entry.network_id) ?? `Network ${entry.network_id}`,
            scanId: entry.scan.id,
            error: entry.scan.error_message,
          },
        ]
      : [],
  );
}
