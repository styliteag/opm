import { describe, it, expect } from "vitest";

import {
  ALERT_ACTIONS,
  ALERT_STATUS,
  NAV_AREAS,
  NAV_V4,
  PORT_STATUS,
  TOOL_LABELS,
  TRIAGE_ACTIONS,
  WHY_QUICK_PICKS,
} from "./terminology";

describe("terminology", () => {
  it("uses effect-based action labels from the glossary", () => {
    expect(ALERT_ACTIONS.allow.label).toBe("Allow");
    expect(ALERT_ACTIONS.mute.label).toBe("Mute");
    expect(ALERT_ACTIONS.revokeRule.label).toBe("Revoke rule");
  });

  it("never uses the old accept/dismiss wording in labels", () => {
    const labels = Object.values(ALERT_ACTIONS).map((a) =>
      a.label.toLowerCase(),
    );
    expect(labels).not.toContain("accept");
    expect(labels).not.toContain("dismiss");
  });

  it("states the consequence for allow and mute", () => {
    expect(ALERT_ACTIONS.allow.description).toContain("never alert again");
    expect(ALERT_ACTIONS.mute.description).toContain("next scan");
  });

  it("defines the three status labels", () => {
    expect(ALERT_STATUS.open.label).toBe("Open");
    expect(ALERT_STATUS.muted.label).toBe("Muted");
    expect(ALERT_STATUS.allowed.label).toBe("Allowed");
  });

  it("defines the three navigation areas", () => {
    expect(Object.values(NAV_AREAS)).toEqual([
      "Monitor",
      "Configuration",
      "Administration",
    ]);
  });
});

describe("terminology v4", () => {
  it("defines the four navigation areas in order", () => {
    expect(Object.values(NAV_V4)).toEqual([
      "Home",
      "Ports",
      "Networks",
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
});
