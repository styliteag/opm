import { describe, expect, it } from "vitest";

import type {
  AlertSSHSummary,
  EnrichedHostPort,
  HostAlertSummary,
  NseResult,
  Vulnerability,
} from "@/lib/types";

import {
  findingsByPort,
  hostPortRows,
  isImportantFinding,
  mergeHostFindings,
  splitFindings,
  sshSummaryBullets,
} from "./hostFindings";

function vuln(over: Partial<Vulnerability>): Vulnerability {
  return {
    id: 1,
    scan_id: 1,
    ip: "10.0.0.1",
    port: 443,
    protocol: "tcp",
    oid: "1.3.6.1",
    name: "Finding",
    description: "desc",
    severity: 0,
    severity_label: "info",
    cvss_base_vector: null,
    cve_ids: [],
    solution: null,
    solution_type: null,
    qod: null,
    source: "gvm",
    created_at: "2026-10-01T00:00:00",
    ...over,
  };
}

function nse(over: Partial<NseResult>): NseResult {
  return {
    id: 1,
    scan_id: 1,
    ip: "10.0.0.1",
    port: 22,
    protocol: "tcp",
    script_name: "ssh2-enum-algos",
    script_output: "output",
    cve_ids: [],
    severity: "high",
    template_id: null,
    created_at: "2026-10-01T00:00:00",
    ...over,
  };
}

function alert(over: Partial<HostAlertSummary>): HostAlertSummary {
  return {
    id: 100,
    type: "new_port",
    port: 22,
    message: "New open port detected: 10.0.0.1:22",
    severity: "high",
    dismissed: false,
    created_at: "2026-10-02T00:00:00",
    dismiss_reason: null,
    network_id: 1,
    network_name: "LAN",
    ssh_summary: null,
    related_ssh_alert_count: 0,
    related_ssh_alerts_dismissed: true,
    ...over,
  };
}

function port(over: Partial<EnrichedHostPort>): EnrichedHostPort {
  return {
    id: 1,
    ip: "10.0.0.1",
    port: 22,
    protocol: "tcp",
    banner: null,
    service_guess: "ssh",
    user_comment: null,
    first_seen_at: "2026-10-01T00:00:00",
    last_seen_at: "2026-10-02T00:00:00",
    is_stale: false,
    alert_id: null,
    alert_status: null,
    alert_severity: null,
    dismiss_reason: null,
    rule_status: null,
    matching_rules: [],
    ssh_summary: null,
    ...over,
  };
}

describe("mergeHostFindings", () => {
  it("merges GVM, nuclei, NSE and SSH sources, important first", () => {
    const findings = mergeHostFindings({
      vulns: [
        vuln({ id: 1, oid: "1.2", name: "TLS info", severity_label: "info" }),
        vuln({
          id: 2,
          oid: "tpl:m",
          name: "Exposed panel",
          source: "nuclei",
          severity_label: "high",
        }),
      ],
      nseResults: [nse({ script_name: "vulners", severity: "medium" })],
      alerts: [
        alert({
          id: 7,
          type: "ssh_weak_cipher",
          port: 22,
          message: "SSH weak ciphers on 10.0.0.1:22",
        }),
      ],
    });
    expect(findings.map((f) => [f.source, f.port, f.title])).toEqual([
      ["nuclei", 443, "Exposed panel"],
      ["ssh", 22, "Weak encryption ciphers offered"],
      ["nse", 22, "vulners"],
      ["gvm", 443, "TLS info"],
    ]);
    expect(findings[1].openAlertIds).toEqual([7]);
  });

  it("dedupes NSE results already mirrored into vulnerabilities", () => {
    const findings = mergeHostFindings({
      vulns: [
        vuln({ oid: "nse:vulners", name: "vulners", source: "nse", port: 22 }),
      ],
      nseResults: [
        nse({ id: 1, script_name: "vulners", port: 22 }),
        nse({ id: 2, script_name: "vulners", port: 22 }),
        nse({ id: 3, script_name: "vulners", port: 80 }),
      ],
      alerts: [],
    });
    expect(findings.map((f) => `${f.source}:${f.port}`).sort()).toEqual([
      "nse:22",
      "nse:80",
    ]);
  });

  it("attaches open finding alerts by finding ID across networks", () => {
    const findings = mergeHostFindings({
      vulns: [
        vuln({ oid: "1.3.6.1.4", name: "DNS recursion", port: 53 }),
        vuln({ oid: "t:m", source: "nuclei", name: "Panel", port: 80 }),
      ],
      nseResults: [],
      alerts: [
        alert({
          id: 11,
          type: "gvm_vulnerability",
          port: 53,
          message:
            "GVM OID 1.3.6.1.4 found 'DNS recursion' on 10.0.0.1:53/udp.",
        }),
        alert({
          id: 12,
          type: "gvm_vulnerability",
          port: 53,
          network_id: 2,
          message:
            "GVM OID 1.3.6.1.4 found 'DNS recursion' on 10.0.0.1:53/udp.",
        }),
        alert({
          id: 13,
          type: "nuclei_vulnerability",
          port: 80,
          message: "Nuclei template t:m matched 'Panel' on 10.0.0.1:80/tcp.",
        }),
      ],
    });
    const dns = findings.find((f) => f.port === 53);
    expect(dns?.openAlertIds).toEqual([11, 12]);
    expect(findings.find((f) => f.port === 80)?.openAlertIds).toEqual([13]);
  });

  it("keeps finding alerts without a stored result as their own finding", () => {
    const findings = mergeHostFindings({
      vulns: [],
      nseResults: [],
      alerts: [
        alert({
          id: 21,
          type: "gvm_cve_detected",
          port: 25,
          severity: "high",
          message: "GVM OID 9.9 found 'Old Exim' on 10.0.0.1:25/tcp.",
        }),
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      source: "gvm",
      title: "Old Exim",
      openAlertIds: [21],
      findingId: null,
    });
  });

  it("ignores port alerts and dismissed alerts", () => {
    expect(
      mergeHostFindings({
        vulns: [],
        nseResults: [],
        alerts: [
          alert({ type: "new_port" }),
          alert({ type: "ssh_weak_kex", dismissed: true }),
        ],
      }),
    ).toEqual([]);
  });
});

describe("isImportantFinding / splitFindings", () => {
  it("treats high+ or anything with an open alert as important", () => {
    const [low, high, alerted] = mergeHostFindings({
      vulns: [
        vuln({ id: 1, oid: "a", name: "a", severity_label: "low" }),
        vuln({ id: 2, oid: "b", name: "b", severity_label: "critical" }),
        vuln({ id: 3, oid: "c", name: "c", severity_label: "info", port: 25 }),
      ],
      nseResults: [],
      alerts: [
        alert({
          id: 5,
          type: "gvm_vulnerability",
          port: 25,
          message: "GVM OID c found 'c' on 10.0.0.1:25/tcp.",
        }),
      ],
    }).sort((x, y) => x.title.localeCompare(y.title));
    expect(isImportantFinding(low)).toBe(false);
    expect(isImportantFinding(high)).toBe(true);
    expect(isImportantFinding(alerted)).toBe(true);
    const split = splitFindings([low, high, alerted]);
    expect(split.important.map((f) => f.title)).toEqual(["b", "c"]);
    expect(split.info.map((f) => f.title)).toEqual(["a"]);
  });
});

describe("findingsByPort", () => {
  it("groups by port with null for host-level findings", () => {
    const grouped = findingsByPort(
      mergeHostFindings({
        vulns: [
          vuln({ id: 1, oid: "x", port: null }),
          vuln({ id: 2, oid: "y" }),
        ],
        nseResults: [],
        alerts: [],
      }),
    );
    expect(grouped.get(null)).toHaveLength(1);
    expect(grouped.get(443)).toHaveLength(1);
  });
});

describe("hostPortRows", () => {
  const rules = {
    accepted: {
      id: 1,
      scope: "network" as const,
      network_id: 1,
      network_name: "LAN",
      rule_type: "accepted" as const,
      description: "Web server",
      ip: "10.0.0.1",
    },
  };

  it("derives status from port alerts only and sorts decision first", () => {
    const rows = hostPortRows(
      [
        port({
          id: 1,
          port: 443,
          matching_rules: [rules.accepted],
          rule_status: "accepted",
        }),
        port({ id: 2, port: 8080 }),
        port({ id: 3, port: 22 }),
        port({ id: 4, port: 25 }),
        port({ id: 5, port: 9922 }),
      ],
      [
        alert({ id: 30, type: "new_port", port: 8080 }),
        alert({ id: 31, type: "new_port", port: 8080, network_id: 2 }),
        // SSH alert on 9922 must not make the port "new"
        alert({ id: 32, type: "ssh_weak_kex", port: 9922 }),
      ],
      [
        alert({
          id: 33,
          type: "new_port",
          port: 25,
          dismissed: true,
          dismiss_reason: "lab",
        }),
      ],
    );
    expect(rows.map((r) => [r.port.port, r.status])).toEqual([
      [8080, "new"],
      [22, "review"],
      [9922, "review"],
      [25, "snoozed"],
      [443, "expected"],
    ]);
    expect(rows[0].openAlertIds).toEqual([30, 31]);
    expect(rows.find((r) => r.port.port === 443)?.why).toBe("Web server");
    expect(rows.find((r) => r.port.port === 25)?.why).toBe("lab");
  });

  it("prefers the port comment as Why and maps critical rules", () => {
    const [row] = hostPortRows(
      [port({ user_comment: "Jump host", rule_status: "critical" })],
      [],
      [],
    );
    expect(row).toMatchObject({ status: "critical", why: "Jump host" });
  });
});

describe("sshSummaryBullets", () => {
  it("lists weaknesses in plain language", () => {
    const summary: AlertSSHSummary = {
      ssh_version: "OpenSSH_7.4",
      publickey_enabled: true,
      password_enabled: true,
      keyboard_interactive_enabled: false,
      has_weak_ciphers: true,
      has_weak_kex: true,
      last_scanned: "2026-10-01T00:00:00",
      recent_scans: [],
      total_scans: 0,
      completed_scans: 0,
      failed_scans: 0,
      avg_scan_duration_seconds: null,
      scans_last_24h: 0,
      scans_last_7d: 0,
    };
    expect(sshSummaryBullets(summary)).toEqual([
      "Password login is allowed",
      "Weak encryption ciphers offered",
      "Weak key exchange offered",
      "Version: OpenSSH_7.4",
    ]);
  });
});
