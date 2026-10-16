import { describe, expect, it } from "vitest";

import type { Vulnerability } from "@/lib/types";

import { findingRuleTargets, groupScanFindings } from "./scanFindings";

function vuln(over: Partial<Vulnerability>): Vulnerability {
  return {
    id: 1,
    scan_id: 9,
    ip: "10.0.0.1",
    port: 443,
    protocol: "tcp",
    oid: "1.3.6.1",
    name: "Finding",
    description: "",
    severity: 0,
    severity_label: "info",
    cvss_base_vector: null,
    cve_ids: [],
    solution: null,
    solution_type: null,
    qod: null,
    source: "gvm",
    created_at: "2026-10-16T10:00:00",
    ...over,
  };
}

describe("groupScanFindings", () => {
  it("groups by IP:port and puts important groups first", () => {
    const groups = groupScanFindings([
      vuln({ id: 1, ip: "10.0.0.2", port: 80, oid: "a" }),
      vuln({ id: 2, ip: "10.0.0.10", port: 22, oid: "b", severity_label: "high" }),
      vuln({ id: 3, ip: "10.0.0.2", port: 80, oid: "c" }),
      vuln({ id: 4, ip: "10.0.0.2", port: null, oid: "d" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "10.0.0.10:22",
      "10.0.0.2:host",
      "10.0.0.2:80",
    ]);
    expect(groups[0].importantCount).toBe(1);
    expect(groups[2].findings).toHaveLength(2);
  });

  it("returns nothing for no findings", () => {
    expect(groupScanFindings([])).toEqual([]);
  });
});

describe("findingRuleTargets", () => {
  it("lists each finding ID once with its count", () => {
    expect(
      findingRuleTargets([
        vuln({ oid: "x", name: "Zeta" }),
        vuln({ id: 2, ip: "10.0.0.3", oid: "x", name: "Zeta" }),
        vuln({ id: 3, oid: "y", name: "Alpha", severity_label: "medium" }),
      ]),
    ).toEqual([
      { oid: "y", name: "Alpha", severity: "medium", count: 1 },
      { oid: "x", name: "Zeta", severity: "info", count: 2 },
    ]);
  });
});
