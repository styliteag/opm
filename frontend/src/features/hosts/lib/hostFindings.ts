import { alertDisplayTitle } from "@/features/alerts/lib/alertDisplayTitle";
import type { PortStatusKey } from "@/lib/terminology";
import type {
  AlertSSHSummary,
  EnrichedHostPort,
  HostAlertSummary,
  NseResult,
  Vulnerability,
  VulnerabilitySeverity,
} from "@/lib/types";

/**
 * Host page model (UI v4, ADR 0008): every finding source (GVM, nuclei, NSE,
 * SSH) folds into one list per port, and port status is derived from port
 * alerts only so a finding alert never makes a port look "new".
 */

export type FindingSource = "gvm" | "nuclei" | "nse" | "ssh";

export interface HostFinding {
  key: string;
  port: number | null;
  source: FindingSource;
  title: string;
  severity: VulnerabilitySeverity;
  cveIds: string[];
  description: string | null;
  solution: string | null;
  /** OID / template:matcher / nse:<script>; null when only an alert exists. */
  findingId: string | null;
  /** Open (undismissed) alerts for this finding, one per network. */
  openAlertIds: number[];
  seenAt: string;
}

const SEVERITY_RANK: Record<VulnerabilitySeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function severityOf(value: string): VulnerabilitySeverity {
  return value in SEVERITY_RANK ? (value as VulnerabilitySeverity) : "medium";
}

export function isImportantFinding(f: HostFinding): boolean {
  return (
    SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high || f.openAlertIds.length > 0
  );
}

const SSH_TITLES: Record<string, string> = {
  ssh_insecure_auth: "Password login allowed",
  ssh_weak_cipher: "Weak encryption ciphers offered",
  ssh_weak_kex: "Weak key exchange offered",
  ssh_outdated_version: "Outdated SSH version",
  ssh_config_regression: "SSH configuration got weaker",
};

const PORT_ALERT_TYPES = new Set(["new_port", "not_allowed", "blocked"]);

function alertSource(type: string): FindingSource | null {
  const prefix = type.split("_")[0];
  return prefix === "gvm" ||
    prefix === "nuclei" ||
    prefix === "nse" ||
    prefix === "ssh"
    ? prefix
    : null;
}

/** Text the backend puts in a finding alert message for this finding ID. */
function alertMarker(source: FindingSource, findingId: string): string {
  if (source === "gvm") return `GVM OID ${findingId} found`;
  if (source === "nuclei") return `Nuclei template ${findingId} matched`;
  return `NSE script '${findingId.replace(/^nse:/, "")}' found`;
}

function findingKey(source: string, id: string, port: number | null): string {
  return `${source}:${id}:${port ?? "host"}`;
}

function fromVulnerability(v: Vulnerability): HostFinding {
  return {
    key: findingKey(v.source, v.oid, v.port),
    port: v.port,
    source: v.source,
    title: v.name,
    severity: v.severity_label,
    cveIds: v.cve_ids,
    description: v.description || null,
    solution: v.solution,
    findingId: v.oid,
    openAlertIds: [],
    seenAt: v.created_at,
  };
}

function fromNseResult(r: NseResult): HostFinding {
  const oid = `nse:${r.script_name}`;
  const port = r.port > 0 ? r.port : null;
  return {
    key: findingKey("nse", oid, port),
    port,
    source: "nse",
    title: r.script_name,
    severity: r.severity,
    cveIds: r.cve_ids,
    description: r.script_output || null,
    solution: null,
    findingId: oid,
    openAlertIds: [],
    seenAt: r.created_at,
  };
}

function fromAlert(a: HostAlertSummary, source: FindingSource): HostFinding {
  const title =
    source === "ssh"
      ? (SSH_TITLES[a.type] ??
        alertDisplayTitle({ source, message: a.message }))
      : alertDisplayTitle({ source, message: a.message });
  return {
    key: source === "ssh" ? findingKey("ssh", a.type, a.port) : `alert:${a.id}`,
    port: a.port,
    source,
    title,
    severity: severityOf(a.severity),
    cveIds: [],
    description: a.message,
    solution: null,
    findingId: null,
    openAlertIds: [a.id],
    seenAt: a.created_at,
  };
}

function compareFindings(a: HostFinding, b: HostFinding): number {
  return (
    Number(isImportantFinding(b)) - Number(isImportantFinding(a)) ||
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    a.title.localeCompare(b.title)
  );
}

export interface FindingInputs {
  vulns: Vulnerability[];
  nseResults: NseResult[];
  /** Open alerts of the host overview; dismissed ones are skipped. */
  alerts: HostAlertSummary[];
}

export function mergeHostFindings({
  vulns,
  nseResults,
  alerts,
}: FindingInputs): HostFinding[] {
  const byKey = new Map<string, HostFinding>();
  for (const v of vulns) {
    const f = fromVulnerability(v);
    byKey.set(f.key, f);
  }
  for (const r of nseResults) {
    const f = fromNseResult(r);
    const prev = byKey.get(f.key);
    if (!prev || prev.seenAt < f.seenAt)
      byKey.set(f.key, prev ? { ...f, key: prev.key } : f);
  }

  for (const a of alerts) {
    const source = alertSource(a.type);
    if (a.dismissed || !source || PORT_ALERT_TYPES.has(a.type)) continue;
    const match = [...byKey.values()].find(
      (f) =>
        f.source === source &&
        f.port === a.port &&
        (source === "ssh"
          ? f.key === findingKey("ssh", a.type, a.port)
          : f.findingId !== null &&
            a.message.includes(alertMarker(source, f.findingId))),
    );
    if (match) {
      byKey.set(match.key, {
        ...match,
        openAlertIds: [...match.openAlertIds, a.id],
      });
    } else {
      const f = fromAlert(a, source);
      byKey.set(f.key, f);
    }
  }
  return [...byKey.values()].sort(compareFindings);
}

export function splitFindings(findings: HostFinding[]): {
  important: HostFinding[];
  info: HostFinding[];
} {
  return {
    important: findings.filter(isImportantFinding),
    info: findings.filter((f) => !isImportantFinding(f)),
  };
}

export function findingsByPort(
  findings: HostFinding[],
): Map<number | null, HostFinding[]> {
  const out = new Map<number | null, HostFinding[]>();
  for (const f of findings) out.set(f.port, [...(out.get(f.port) ?? []), f]);
  return out;
}

export interface HostPortRow {
  port: EnrichedHostPort;
  status: PortStatusKey;
  why: string | null;
  /** Open port alerts for this port (one per network) — Expected/Snooze targets. */
  openAlertIds: number[];
}

const DECISION_RANK: Partial<Record<PortStatusKey, number>> = {
  new: 0,
  review: 1,
};

/** Port rows with v4 status + Why; ports needing a decision first, then by port. */
export function hostPortRows(
  ports: EnrichedHostPort[],
  openAlerts: HostAlertSummary[],
  dismissedAlerts: HostAlertSummary[],
): HostPortRow[] {
  const portAlerts = (list: HostAlertSummary[], port: number) =>
    list.filter((a) => a.port === port && PORT_ALERT_TYPES.has(a.type));

  const rows = ports.map((p): HostPortRow => {
    const open = portAlerts(openAlerts, p.port);
    const dismissed = portAlerts(dismissedAlerts, p.port);
    let status: PortStatusKey = "review";
    if (p.rule_status === "critical") status = "critical";
    else if (p.rule_status === "accepted") status = "expected";
    else if (open.length > 0) status = "new";
    else if (dismissed.length > 0) status = "snoozed";

    const why =
      p.user_comment ||
      p.matching_rules.find((r) => r.description)?.description ||
      [...open, ...dismissed].find((a) => a.dismiss_reason)?.dismiss_reason ||
      null;
    return { port: p, status, why, openAlertIds: open.map((a) => a.id) };
  });

  return rows.sort(
    (a, b) =>
      (DECISION_RANK[a.status] ?? 2) - (DECISION_RANK[b.status] ?? 2) ||
      a.port.port - b.port.port,
  );
}

type SshSummaryFields = Pick<
  AlertSSHSummary,
  | "ssh_version"
  | "password_enabled"
  | "keyboard_interactive_enabled"
  | "has_weak_ciphers"
  | "has_weak_kex"
>;

/** Plain-language SSH check results for the expanded port row. */
export function sshSummaryBullets(ssh: SshSummaryFields): string[] {
  const bullets: string[] = [];
  if (ssh.password_enabled) bullets.push("Password login is allowed");
  if (ssh.keyboard_interactive_enabled)
    bullets.push("Keyboard-interactive login is allowed");
  if (ssh.has_weak_ciphers) bullets.push("Weak encryption ciphers offered");
  if (ssh.has_weak_kex) bullets.push("Weak key exchange offered");
  if (ssh.ssh_version) bullets.push(`Version: ${ssh.ssh_version}`);
  return bullets;
}
