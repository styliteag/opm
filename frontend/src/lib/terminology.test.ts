import { describe, it, expect } from "vitest";

import {
  EXPECTED_SCOPES,
  NAV_V4,
  PORT_STATUS,
  TOOL_LABELS,
  TRIAGE_ACTIONS,
  WHY_QUICK_PICKS,
} from "./terminology";

describe("terminology v4", () => {
  it("defines the navigation labels in sidebar order (Scans nests under Networks)", () => {
    expect(Object.values(NAV_V4)).toEqual([
      "Home",
      "Ports",
      "Networks",
      "Scans",
      "Settings",
    ]);
  });

  it("labels every port status with a one-line meaning", () => {
    expect(PORT_STATUS.new.label).toBe("New");
    expect(PORT_STATUS.review.label).toBe("To review");
    expect(PORT_STATUS.expected.label).toBe("Expected");
    expect(PORT_STATUS.snoozed.label).toBe("Snoozed");
    expect(PORT_STATUS.critical.label).toBe("Always critical");
    for (const entry of Object.values(PORT_STATUS)) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("uses the v4 triage verbs, not the retired v3 ones", () => {
    const labels = Object.values(TRIAGE_ACTIONS).map((a) => a.label);
    expect(labels).toEqual([
      "Expected",
      "Snooze",
      "Accept risk",
      "Assign",
      "Reopen",
      "Revoke",
    ]);
    expect(labels).not.toContain("Allow");
    expect(labels).not.toContain("Mute");
  });

  it("states the consequence of expected, snooze and revoke", () => {
    expect(TRIAGE_ACTIONS.expected.description).toContain("won't alert again");
    expect(TRIAGE_ACTIONS.snooze.description).toContain("next scan");
    expect(TRIAGE_ACTIONS.revoke.description).toContain("alert again");
  });

  it("maps tool keys to plain labels", () => {
    expect(TOOL_LABELS.gvm).toBe("Deep vulnerability scan");
    expect(TOOL_LABELS.nuclei).toBe("Web vulnerability check");
    expect(TOOL_LABELS.oid).toBe("Finding ID");
    for (const label of Object.values(TOOL_LABELS)) {
      expect(label).not.toMatch(/gvm|nse|nuclei|masscan|nmap|oid/i);
    }
  });

  it("offers the five quick-pick reasons", () => {
    expect(WHY_QUICK_PICKS).toHaveLength(5);
    expect(WHY_QUICK_PICKS[0]).toBe("Web server");
  });

  it("defines the Expected scopes with this host first", () => {
    expect(Object.values(EXPECTED_SCOPES)).toEqual([
      "This host only",
      "All hosts in this network",
      "Everywhere",
    ]);
  });
});
