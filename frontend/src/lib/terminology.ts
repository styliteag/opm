/**
 * UI terminology — single source of truth for user-facing wording.
 *
 * Mirrors docs/redesign/glossary.md. UI labels are effect-based (Allow/Mute);
 * API and DB names (accept/dismiss) are unchanged — the mapping lives in the
 * glossary and must not leak into UI copy.
 */

export interface TermEntry {
  label: string;
  description: string;
}

export const ALERT_STATUS: Record<"open" | "muted" | "allowed", TermEntry> = {
  open: {
    label: "Open",
    description: "Needs a decision.",
  },
  muted: {
    label: "Muted",
    description: "Muted until the next scan finds it again.",
  },
  allowed: {
    label: "Allowed",
    description: "Covered by an allow rule.",
  },
};

export type AlertStatusKey = keyof typeof ALERT_STATUS;

export const ALERT_ACTIONS: Record<
  "allow" | "mute" | "assign" | "reopen" | "revokeRule",
  TermEntry
> = {
  allow: {
    label: "Allow",
    description:
      "Creates a rule: this port is expected here; it will never alert again.",
  },
  mute: {
    label: "Mute",
    description: "Hides this alert; the next scan will raise it again.",
  },
  assign: {
    label: "Assign",
    description: "A colleague takes ownership.",
  },
  reopen: {
    label: "Reopen",
    description: "Back to Open. Any existing allow rule stays in effect.",
  },
  revokeRule: {
    label: "Revoke rule",
    description: "Deletes the allow rule; future scans alert again.",
  },
};

export type AlertActionKey = keyof typeof ALERT_ACTIONS;

export const NAV_AREAS: Record<
  "monitor" | "configuration" | "administration",
  string
> = {
  monitor: "Monitor",
  configuration: "Configuration",
  administration: "Administration",
};

/* ------------------------------------------------------------------ */
/* UI v4 terminology (glossary.md, ADRs 0008–0014). The v3 exports above */
/* stay until the alerts code that imports them is replaced.            */
/* ------------------------------------------------------------------ */

export const NAV_V4: Record<"home" | "ports" | "networks" | "settings", string> =
  {
    home: "Home",
    ports: "Ports",
    networks: "Networks",
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
