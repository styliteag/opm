import {
  isImportantFinding,
  mergeHostFindings,
  type HostFinding,
} from "@/features/hosts/lib/hostFindings";
import type { Vulnerability } from "@/lib/types";

/** Findings of one scan for one host:port, rendered with the host FindingsList. */
export interface ScanFindingGroup {
  key: string;
  ip: string;
  port: number | null;
  findings: HostFinding[];
  importantCount: number;
}

/**
 * Group a scan's findings by IP:port (UI v4, ADR 0008: findings live on the
 * port). Groups with important findings come first, then by IP and port.
 */
export function groupScanFindings(
  vulns: readonly Vulnerability[],
): ScanFindingGroup[] {
  const byTarget = new Map<string, Vulnerability[]>();
  for (const v of vulns) {
    const key = `${v.ip}:${v.port ?? "host"}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), v]);
  }
  const groups = [...byTarget.entries()].map(([key, list]) => {
    const findings = mergeHostFindings({ vulns: list, nseResults: [], alerts: [] });
    return {
      key,
      ip: list[0].ip,
      port: list[0].port,
      findings,
      importantCount: findings.filter(isImportantFinding).length,
    };
  });
  return groups.sort(
    (a, b) =>
      Number(b.importantCount > 0) - Number(a.importantCount > 0) ||
      a.ip.localeCompare(b.ip, undefined, { numeric: true }) ||
      (a.port ?? 0) - (b.port ?? 0),
  );
}

export interface FindingRuleTarget {
  oid: string;
  name: string;
  severity: Vulnerability["severity_label"];
  count: number;
}

/** Distinct finding IDs of a scan, for the advanced "alert severity rules" list. */
export function findingRuleTargets(
  vulns: readonly Vulnerability[],
): FindingRuleTarget[] {
  const byOid = new Map<string, FindingRuleTarget>();
  for (const v of vulns) {
    const prev = byOid.get(v.oid);
    byOid.set(
      v.oid,
      prev
        ? { ...prev, count: prev.count + 1 }
        : { oid: v.oid, name: v.name, severity: v.severity_label, count: 1 },
    );
  }
  return [...byOid.values()].sort((a, b) => a.name.localeCompare(b.name));
}
