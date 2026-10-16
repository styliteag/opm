import { describe, expect, it } from "vitest";

import type { GvmSeverityRule } from "../api";
import { findingSourceLabel, isAcceptedRisk } from "./ruleKind";

const baseRule = (overrides: Partial<GvmSeverityRule>): GvmSeverityRule => ({
  id: 1,
  oid: "1.3.6.1.4.1.25623.1.0.147232",
  network_id: 3,
  network_name: "dmz",
  severity_override: "info",
  reason: "Known resolver",
  created_by_user_id: null,
  created_by_username: null,
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-16T00:00:00Z",
  ...overrides,
});

describe("isAcceptedRisk", () => {
  it("is true for info override with a reason", () => {
    expect(isAcceptedRisk(baseRule({}))).toBe(true);
  });

  it("is false without a reason", () => {
    expect(isAcceptedRisk(baseRule({ reason: null }))).toBe(false);
    expect(isAcceptedRisk(baseRule({ reason: "   " }))).toBe(false);
  });

  it("is false for other severities", () => {
    expect(isAcceptedRisk(baseRule({ severity_override: "low" }))).toBe(false);
  });
});

describe("findingSourceLabel", () => {
  it("detects vulnerability script IDs", () => {
    expect(findingSourceLabel("nse:dns-recursion")).toBe(
      "Vulnerability scripts",
    );
  });

  it("detects deep scan numeric OIDs", () => {
    expect(findingSourceLabel("1.3.6.1.4.1.25623.1.0.147232")).toBe(
      "Deep vulnerability scan",
    );
  });

  it("treats template:matcher IDs as web checks", () => {
    expect(findingSourceLabel("tech-detect:nginx")).toBe(
      "Web vulnerability check",
    );
  });
});
