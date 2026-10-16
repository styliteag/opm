/**
 * UI terminology — single source of truth for user-facing wording.
 *
 * Mirrors docs/redesign/glossary.md (UI v4, ADRs 0008–0014). UI labels are
 * effect-based (Expected/Snooze); API and DB names (accept/dismiss) are
 * unchanged — the mapping lives in the glossary and must not leak into UI copy.
 */

export interface TermEntry {
  label: string;
  description: string;
}

export const NAV_V4: Record<
  "home" | "ports" | "networks" | "scans" | "settings",
  string
> = {
  home: "Home",
  ports: "Ports",
  networks: "Networks",
  scans: "Scans",
  settings: "Settings",
};

export type PortStatusKey =
  | "new"
  | "review"
  | "expected"
  | "snoozed"
  | "critical";

export const PORT_STATUS: Record<PortStatusKey, TermEntry> = {
  new: {
    label: "New",
    description: "First seen in the latest scan and not yet decided.",
  },
  review: {
    label: "To review",
    description: "Open, no Expected rule, not new.",
  },
  expected: {
    label: "Expected",
    description: "Covered by an Expected rule; the reason is shown next to it.",
  },
  snoozed: {
    label: "Snoozed",
    description: "Hidden until the next scan raises it again.",
  },
  critical: {
    label: "Always critical",
    description: "A rule makes this port alert as critical whenever it is open.",
  },
};

export type TriageActionKey =
  | "expected"
  | "snooze"
  | "acceptRisk"
  | "assign"
  | "reopen"
  | "revoke";

export const TRIAGE_ACTIONS: Record<TriageActionKey, TermEntry> = {
  expected: {
    label: "Expected",
    description:
      "This port is supposed to be open here; it won't alert again.",
  },
  snooze: {
    label: "Snooze",
    description: "Hides this until the next scan finds it again.",
  },
  acceptRisk: {
    label: "Accept risk",
    description:
      "This finding is known and accepted; it won't pop up again on this network.",
  },
  assign: {
    label: "Assign",
    description: "A colleague takes ownership.",
  },
  reopen: {
    label: "Reopen",
    description: "Back to the queue. Existing Expected rule stays.",
  },
  revoke: {
    label: "Revoke",
    description: "Deletes the rule; future scans alert again.",
  },
};

export type ToolKey = "masscan" | "nmap" | "nuclei" | "nse" | "gvm" | "ssh" | "oid";

/** Plain label per tool (ADR 0010); the tool name stays secondary text. */
export const TOOL_LABELS: Record<ToolKey, string> = {
  masscan: "Port scan — fast",
  nmap: "Port scan — detailed",
  nuclei: "Web vulnerability check",
  nse: "Vulnerability scripts",
  gvm: "Deep vulnerability scan",
  ssh: "SSH check",
  oid: "Finding ID",
};

/** One-click reasons offered when marking a port Expected. */
export const WHY_QUICK_PICKS: readonly string[] = [
  "Web server",
  "Remote admin",
  "Mail server",
  "VPN endpoint",
  "Vendor appliance",
];

export type ExpectedScopeKey = "host" | "network" | "global";

/** Scope choices for Expected (ADR 0012); "host" is the one-click default. */
export const EXPECTED_SCOPES: Record<ExpectedScopeKey, string> = {
  host: "This host only",
  network: "All hosts in this network",
  global: "Everywhere",
};
