import { describe, expect, it } from "vitest";

import type { Alert, LatestScanEntry, Scanner } from "@/lib/types";

import {
  failedNetworkScans,
  groupPortAlerts,
  importantFindings,
  offlineScanners,
} from "./homeQueue";

function alert(overrides: Partial<Alert>): Alert {
  return {
    id: 1,
    type: "new_port",
    source: "port",
    source_key: null,
    network_id: 1,
    network_name: "LAN",
    global_open_port_id: null,
    ip: "10.0.0.1",
    port: 53,
    message: "New open port detected: 10.0.0.1:53",
    dismissed: false,
    assigned_to_user_id: null,
    assigned_to_email: null,
    created_at: "2026-10-16T10:00:00",
    dismiss_reason: null,
    severity: "high",
    severity_override: null,
    host_id: 7,
    hostname: "dns.local",
    user_comment: null,
    last_comment: null,
    last_comment_by: null,
    last_comment_at: null,
    ssh_summary: null,
    related_ssh_alert_count: 0,
    related_ssh_alerts_dismissed: true,
    matching_rules: [],
    queue_state: "inbox",
    policy_state: "none",
    allow_rule_id: null,
    allow_scope: null,
    ...overrides,
  };
}

describe("groupPortAlerts", () => {
  it("merges alerts for the same ip:port across networks", () => {
    const groups = groupPortAlerts([
      alert({ id: 1, network_id: 1, network_name: "LAN" }),
      alert({ id: 2, network_id: 2, network_name: "DMZ" }),
      alert({ id: 3, network_id: 3, network_name: "LAN" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("10.0.0.1:53");
    expect(groups[0].alertIds).toEqual([1, 2, 3]);
    expect(groups[0].networks).toEqual(["LAN", "DMZ"]);
  });

  it("keeps different ports apart and ignores non-port alerts", () => {
    const groups = groupPortAlerts([
      alert({ id: 1, port: 53 }),
      alert({ id: 2, port: 80 }),
      alert({ id: 3, source: "gvm", port: 80 }),
      alert({ id: 4, port: null }),
    ]);
    expect(groups.map((g) => g.key).sort()).toEqual([
      "10.0.0.1:53",
      "10.0.0.1:80",
    ]);
  });

  it("takes the max effective severity, newest time and first Why", () => {
    const [g] = groupPortAlerts([
      alert({ id: 1, severity: "medium", created_at: "2026-10-01T00:00:00" }),
      alert({
        id: 2,
        severity: "medium",
        severity_override: "critical",
        created_at: "2026-10-10T00:00:00",
        user_comment: "DNS resolver",
      }),
      alert({ id: 3, severity: "high", created_at: "2026-10-05T00:00:00" }),
    ]);
    expect(g.severity).toBe("critical");
    expect(g.newestAt).toBe("2026-10-10T00:00:00");
    expect(g.why).toBe("DNS resolver");
  });

  it("sorts by severity, then newest first", () => {
    const groups = groupPortAlerts([
      alert({ id: 1, port: 1, severity: "medium", created_at: "2026-10-09T00:00:00" }),
      alert({ id: 2, port: 2, severity: "critical", created_at: "2026-10-01T00:00:00" }),
      alert({ id: 3, port: 3, severity: "medium", created_at: "2026-10-10T00:00:00" }),
    ]);
    expect(groups.map((g) => g.port)).toEqual([2, 3, 1]);
  });

  it("uses the first host_id and hostname that is set", () => {
    const [g] = groupPortAlerts([
      alert({ id: 1, host_id: null, hostname: null }),
      alert({ id: 2, host_id: 9, hostname: "x.local" }),
    ]);
    expect(g.hostId).toBe(9);
    expect(g.hostname).toBe("x.local");
  });
});

describe("importantFindings", () => {
  it("keeps only non-port alerts at high or critical effective severity", () => {
    const result = importantFindings([
      alert({ id: 1, source: "port", severity: "critical" }),
      alert({ id: 2, source: "gvm", severity: "high" }),
      alert({ id: 3, source: "nuclei", severity: "medium" }),
      alert({ id: 4, source: "nse", severity: "info", severity_override: "critical" }),
      alert({ id: 5, source: "ssh", severity: "high", severity_override: "medium" }),
    ]);
    expect(result.map((a) => a.id)).toEqual([4, 2]);
  });
});

describe("offlineScanners", () => {
  const now = new Date("2026-10-16T12:00:00Z").getTime();
  const scanner = (name: string, last_seen_at: string | null): Scanner => ({
    id: 1,
    name,
    description: null,
    last_seen_at,
    scanner_version: null,
    kind: "standard",
  });

  it("lists scanners not seen within five minutes", () => {
    const result = offlineScanners(
      [
        scanner("fresh", "2026-10-16T11:58:00"),
        scanner("stale", "2026-10-16T11:50:00"),
        scanner("never", null),
      ],
      now,
    );
    expect(result).toEqual(["stale", "never"]);
  });
});

describe("failedNetworkScans", () => {
  it("returns networks whose latest scan failed, with names", () => {
    const entries = [
      { network_id: 1, scan: { id: 10, status: "failed", error_message: "boom" } },
      { network_id: 2, scan: { id: 11, status: "completed", error_message: null } },
      { network_id: 3, scan: null },
    ] as unknown as LatestScanEntry[];
    expect(
      failedNetworkScans(entries, new Map([[1, "LAN"]])),
    ).toEqual([{ networkId: 1, name: "LAN", scanId: 10, error: "boom" }]);
  });
});
