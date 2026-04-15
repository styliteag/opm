import { describe, expect, it } from "vitest";

import { buildExport, parseAndResolve } from "./importExport";
import type { GvmSeverityRule } from "../api";

const baseRule = (overrides: Partial<GvmSeverityRule>): GvmSeverityRule => ({
  id: 1,
  oid: "nse:dns-recursion",
  network_id: null,
  network_name: null,
  severity_override: "high",
  reason: null,
  created_by_user_id: null,
  created_by_username: null,
  created_at: "2026-04-15T00:00:00Z",
  updated_at: "2026-04-15T00:00:00Z",
  ...overrides,
});

const networks = [
  { id: 10, name: "prod-dmz" },
  { id: 20, name: "office-lan" },
];

describe("buildExport", () => {
  it("strips runtime fields and preserves network_name for portability", () => {
    const rules = [
      baseRule({ id: 7, network_id: 10, network_name: "prod-dmz" }),
      baseRule({ id: 8, oid: "1.2.3", severity_override: "medium" }),
    ];
    const payload = buildExport(rules);
    expect(payload.version).toBe(1);
    expect(payload.rules).toEqual([
      {
        oid: "nse:dns-recursion",
        network_name: "prod-dmz",
        severity_override: "high",
        reason: null,
      },
      {
        oid: "1.2.3",
        network_name: null,
        severity_override: "medium",
        reason: null,
      },
    ]);
  });
});

describe("parseAndResolve", () => {
  it("resolves network names to ids and keeps globals as null", () => {
    const text = JSON.stringify({
      version: 1,
      exported_at: "2026-04-15T00:00:00Z",
      rules: [
        {
          oid: "nse:dns-recursion",
          network_name: null,
          severity_override: "high",
          reason: "noisy finding",
        },
        {
          oid: "1.2.3",
          network_name: "prod-dmz",
          severity_override: "critical",
          reason: null,
        },
      ],
    });
    const { valid, skipped } = parseAndResolve(text, networks);
    expect(skipped).toEqual([]);
    expect(valid).toEqual([
      {
        oid: "nse:dns-recursion",
        network_id: null,
        severity_override: "high",
        reason: "noisy finding",
      },
      {
        oid: "1.2.3",
        network_id: 10,
        severity_override: "critical",
        reason: null,
      },
    ]);
  });

  it("skips entries with unknown networks and invalid shapes", () => {
    const text = JSON.stringify({
      rules: [
        { oid: "a", network_name: "ghost", severity_override: "high" },
        { oid: "", network_name: null, severity_override: "high" },
        { oid: "b", network_name: null, severity_override: "nuclear" },
        { oid: "c", network_name: null, severity_override: "low" },
      ],
    });
    const { valid, skipped } = parseAndResolve(text, networks);
    expect(valid.map((v) => v.oid)).toEqual(["c"]);
    expect(skipped).toHaveLength(3);
    expect(skipped[0].reason).toMatch(/Unknown network "ghost"/);
  });

  it("accepts a bare array payload", () => {
    const text = JSON.stringify([
      { oid: "a", severity_override: "medium" },
    ]);
    const { valid } = parseAndResolve(text, networks);
    expect(valid).toEqual([
      {
        oid: "a",
        network_id: null,
        severity_override: "medium",
        reason: null,
      },
    ]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseAndResolve("{not json", networks)).toThrow(/Invalid JSON/);
  });

  it("throws when top-level shape is wrong", () => {
    expect(() => parseAndResolve(JSON.stringify({ foo: 1 }), networks)).toThrow(
      /rules/,
    );
  });
});
