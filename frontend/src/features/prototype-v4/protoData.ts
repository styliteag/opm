// PROTOTYPE (UI v4) — throwaway helpers shared by the Home/Host variants.
import { toast } from "sonner";

import type {
  Alert,
  EnrichedHostPort,
  Severity,
  Vulnerability,
  VulnerabilitySeverity,
} from "@/lib/types";

/** Stub for every mutation in the prototype — nothing is written. */
export function stubAction(label: string): void {
  toast.info(`Prototype: "${label}" would happen here — nothing was saved.`);
}

export const WHY_QUICK_PICKS = [
  "Web server",
  "Remote admin",
  "Mail server",
  "VPN endpoint",
  "Vendor appliance",
];

export const TOOL_LABEL: Record<string, string> = {
  port: "Port scan",
  ssh: "SSH check",
  nuclei: "Web vulnerability check",
  nse: "Vulnerability scripts",
  gvm: "Deep vulnerability scan",
};

export function effectiveSeverity(alert: Alert): Severity {
  return alert.severity_override ?? alert.severity;
}

export function isImportant(sev: string): boolean {
  return sev === "critical" || sev === "high";
}

/** One row per IP:port across networks (ADR 0012 grouping). */
export interface PortGroup {
  key: string;
  ip: string;
  port: number;
  hostId: number | null;
  hostname: string | null;
  severity: Severity;
  networks: string[];
  alerts: Alert[];
  newestAt: string;
  why: string | null;
}

const SEV_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function sevRank(sev: string): number {
  return SEV_RANK[sev] ?? 0;
}

export function groupPortAlerts(alerts: Alert[]): PortGroup[] {
  const groups = new Map<string, PortGroup>();
  for (const a of alerts) {
    if (a.source !== "port" || a.port == null) continue;
    const key = `${a.ip}:${a.port}`;
    const sev = effectiveSeverity(a);
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, {
        key,
        ip: a.ip,
        port: a.port,
        hostId: a.host_id,
        hostname: a.hostname,
        severity: sev,
        networks: a.network_name ? [a.network_name] : [],
        alerts: [a],
        newestAt: a.created_at,
        why: a.user_comment,
      });
      continue;
    }
    groups.set(key, {
      ...prev,
      severity: sevRank(sev) > sevRank(prev.severity) ? sev : prev.severity,
      networks:
        a.network_name && !prev.networks.includes(a.network_name)
          ? [...prev.networks, a.network_name]
          : prev.networks,
      alerts: [...prev.alerts, a],
      newestAt: a.created_at > prev.newestAt ? a.created_at : prev.newestAt,
    });
  }
  return [...groups.values()].sort(
    (x, y) =>
      sevRank(y.severity) - sevRank(x.severity) ||
      y.newestAt.localeCompare(x.newestAt),
  );
}

/** Findings that should pop up on Home: non-port alerts at high+ (ADR 0013). */
export function importantFindings(alerts: Alert[]): Alert[] {
  return alerts
    .filter((a) => a.source !== "port" && isImportant(effectiveSeverity(a)))
    .sort((x, y) => sevRank(effectiveSeverity(y)) - sevRank(effectiveSeverity(x)));
}

/** Strip tool jargon from alert messages for the plain-language variants. */
export function plainTitle(alert: Alert): string {
  return alert.message
    .replace(/^New open port detected globally:\s*/i, "New open port ")
    .replace(/GVM OID [\d.]+ found/i, "Deep vulnerability scan finding")
    .replace(/\s*\(severity promoted.*\)$/i, "");
}

export type PortStatus = "new" | "review" | "expected" | "snoozed" | "critical";

export function portStatus(p: EnrichedHostPort): PortStatus {
  if (p.rule_status === "critical") return "critical";
  if (p.rule_status === "accepted") return "expected";
  if (p.alert_status === "new") return "new";
  if (p.alert_status === "dismissed") return "snoozed";
  return "review";
}

export const PORT_STATUS_LABEL: Record<PortStatus, string> = {
  new: "New",
  review: "To review",
  expected: "Expected",
  snoozed: "Snoozed",
  critical: "Always critical",
};

export const PORT_STATUS_CLASS: Record<PortStatus, string> = {
  new: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  expected: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  snoozed: "bg-muted text-muted-foreground border-border",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function portWhy(p: EnrichedHostPort): string | null {
  return (
    p.user_comment ??
    p.matching_rules.find((r) => r.description)?.description ??
    p.dismiss_reason
  );
}

export function findingsByPort(
  vulns: Vulnerability[],
): Map<number | null, Vulnerability[]> {
  const out = new Map<number | null, Vulnerability[]>();
  for (const v of vulns) {
    out.set(v.port, [...(out.get(v.port) ?? []), v]);
  }
  return out;
}

export function vulnSevClass(sev: VulnerabilitySeverity): string {
  switch (sev) {
    case "critical":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "high":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "medium":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    default:
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
}
