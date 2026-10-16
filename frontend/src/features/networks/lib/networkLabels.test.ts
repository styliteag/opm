import { describe, expect, it } from "vitest";

import type { ScanSummary } from "@/lib/types";

import {
  engineName,
  formatDuration,
  formatSeconds,
  formatTimeUntil,
  lastScanState,
  RULE_TYPE_LABELS,
  ruleTarget,
  scanTypeLabel,
  triggerLabel,
} from "./networkLabels";

function scan(over: Partial<ScanSummary>): ScanSummary {
  return {
    id: 1,
    network_id: 1,
    scanner_id: 1,
    status: "completed",
    started_at: "2026-10-16T10:00:00",
    completed_at: "2026-10-16T10:05:00",
    cancelled_at: null,
    cancelled_by: null,
    cancelled_by_email: null,
    error_message: null,
    trigger_type: "manual",
    hidden: false,
    progress_percent: null,
    progress_message: null,
    actual_rate: null,
    port_count: 3,
    ...over,
  };
}

describe("scanTypeLabel / engineName", () => {
  it.each([
    ["masscan", "Port scan — fast", "masscan"],
    ["nmap", "Port scan — detailed", "nmap"],
    ["greenbone", "Deep vulnerability scan", "Greenbone / GVM"],
    ["nse", "Vulnerability scripts", "nmap NSE"],
    ["other", "other", "other"],
  ])("%s", (type, label, engine) => {
    expect(scanTypeLabel(type)).toBe(label);
    expect(engineName(type)).toBe(engine);
  });
});

describe("lastScanState", () => {
  it.each([
    [undefined, "never"],
    [null, "never"],
    [scan({ status: "completed" }), "ok"],
    [scan({ status: "failed" }), "failed"],
    [scan({ status: "running" }), "running"],
    [scan({ status: "planned" }), "running"],
    [scan({ status: "cancelled" }), "cancelled"],
  ] as const)("%o → %s", (input, state) => {
    expect(lastScanState(input)).toBe(state);
  });
});

describe("time helpers", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");

  it("formats time until the next run", () => {
    expect(formatTimeUntil(null, now)).toBeNull();
    expect(formatTimeUntil("2026-10-16T09:00:00Z", now)).toBe("now");
    expect(formatTimeUntil("2026-10-16T10:30:00Z", now)).toBe("in 30m");
    expect(formatTimeUntil("2026-10-16T12:15:00Z", now)).toBe("in 2h 15m");
    expect(formatTimeUntil("2026-10-19T10:00:00Z", now)).toBe("in 3d");
  });

  it("formats scan duration", () => {
    expect(formatDuration(scan({}))).toBe("5m");
    expect(formatDuration(scan({ completed_at: null }))).toBeNull();
    expect(
      formatDuration(scan({ completed_at: "2026-10-16T10:00:42" })),
    ).toBe("42s");
  });

  it("formats seconds", () => {
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(3600)).toBe("1h");
    expect(formatSeconds(7200)).toBe("2h");
    expect(formatSeconds(5400)).toBe("1h 30m");
    expect(formatSeconds(90)).toBe("1m 30s");
  });
});

describe("triggerLabel", () => {
  it("maps trigger types", () => {
    expect(triggerLabel("manual")).toBe("Manual");
    expect(triggerLabel("scheduled")).toBe("Scheduled");
  });
});

describe("rule labels", () => {
  it("uses glossary terms", () => {
    expect(RULE_TYPE_LABELS).toEqual({
      accepted: "Expected",
      critical: "Always critical",
    });
  });

  it("formats the rule target", () => {
    expect(ruleTarget({ match_criteria: { ip: "10.0.0.1", port: 22 } })).toBe(
      "10.0.0.1:22",
    );
    expect(ruleTarget({ match_criteria: {} })).toBe("any port");
  });
});
