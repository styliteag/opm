import { describe, expect, it } from "vitest";

import type { PortRule } from "../types";
import {
  countRulesByType,
  filterRulesByType,
  ruleSourceLabel,
  RULE_TYPE_LABELS,
} from "./ruleLabels";

const rule = (overrides: Partial<PortRule>): PortRule => ({
  id: 1,
  network_id: null,
  network_name: null,
  rule_type: "accepted",
  ip: null,
  port: "22",
  source: "port",
  alert_type: null,
  script_name: null,
  description: null,
  enabled: true,
  created_at: "2026-10-16T00:00:00Z",
  hit_count: 0,
  ...overrides,
});

describe("RULE_TYPE_LABELS", () => {
  it("uses the glossary terms for rule types", () => {
    expect(RULE_TYPE_LABELS.accepted).toBe("Expected");
    expect(RULE_TYPE_LABELS.critical).toBe("Always critical");
  });
});

describe("ruleSourceLabel", () => {
  it("maps sources to plain labels", () => {
    expect(ruleSourceLabel("port")).toBe("Port");
    expect(ruleSourceLabel("ssh")).toBe("SSH check");
    expect(ruleSourceLabel("nse")).toBe("Vulnerability scripts");
    expect(ruleSourceLabel("nuclei")).toBe("Web vulnerability check");
    expect(ruleSourceLabel("gvm")).toBe("Deep vulnerability scan");
  });

  it("falls back to Port for unknown sources", () => {
    expect(ruleSourceLabel("weird")).toBe("Port");
  });
});

describe("filterRulesByType", () => {
  const rules = [
    rule({ id: 1, rule_type: "accepted" }),
    rule({ id: 2, rule_type: "critical" }),
    rule({ id: 3, rule_type: "accepted" }),
  ];

  it("returns all rules for 'all'", () => {
    expect(filterRulesByType(rules, "all")).toHaveLength(3);
  });

  it("keeps only the requested type", () => {
    expect(filterRulesByType(rules, "accepted").map((r) => r.id)).toEqual([
      1, 3,
    ]);
    expect(filterRulesByType(rules, "critical").map((r) => r.id)).toEqual([2]);
  });

  it("does not mutate the input", () => {
    const copy = [...rules];
    filterRulesByType(rules, "critical");
    expect(rules).toEqual(copy);
  });
});

describe("countRulesByType", () => {
  it("counts each type", () => {
    expect(
      countRulesByType([
        rule({ rule_type: "accepted" }),
        rule({ rule_type: "critical" }),
        rule({ rule_type: "accepted" }),
      ]),
    ).toEqual({ all: 3, accepted: 2, critical: 1 });
  });
});
