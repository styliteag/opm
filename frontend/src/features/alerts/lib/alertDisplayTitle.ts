import { TOOL_LABELS } from "@/lib/terminology";
import type { Alert } from "@/lib/types";

/**
 * Plain-language alert titles (ADR 0010): tool jargon (OIDs, template IDs,
 * "detected globally") is removed; the tool shows up as secondary text via
 * alertToolLabel instead.
 */

const PORT_PATTERNS: readonly [RegExp, string][] = [
  [/^New open port detected(?: globally)?:\s*/i, "New open port "],
  [/^Open port not in allowlist:\s*/i, "Unexpected open port "],
  [/^Blocked port detected:\s*/i, "Always-critical port open "],
];

const FINDING_NAME: Record<string, RegExp> = {
  gvm: /^GVM OID \S+ found '(.*?)' on /,
  nuclei: /^Nuclei template \S+ matched '(.*?)' on /,
  nse: /^NSE script '(.*?)' found/,
};

const FINDING_FALLBACK: Record<string, string> = {
  gvm: `${TOOL_LABELS.gvm} finding`,
  nuclei: `${TOOL_LABELS.nuclei} finding`,
  nse: `${TOOL_LABELS.nse} finding`,
};

const CVE_LIST = /CVEs: ((?:CVE-\d+-\d+(?:, )?)+)(?: \(\+(\d+) more\))?/;

/** "Known vulnerabilities (CVE-a, CVE-b, +3 more)" for NSE CVE matches (e.g. vulners). */
function cveTitle(message: string): string | null {
  const match = CVE_LIST.exec(message);
  if (!match) return null;
  const cves = match[1].split(", ").filter(Boolean);
  const extra = cves.length - 2 + Number(match[2] ?? 0);
  const shown = cves.slice(0, 2).join(", ");
  return `Known vulnerabilities (${shown}${extra > 0 ? `, +${extra} more` : ""})`;
}

const PROMOTION_NOTE = /\s*\(severity promoted from \w+ to \w+ via rule\)\s*$/i;
const TARGET_SUFFIX = /\s+on [0-9a-f.:[\]]+(?:\/\w+)?\.?$/i;

export function alertDisplayTitle(
  alert: Pick<Alert, "source" | "message">,
): string {
  const message = alert.message.replace(PROMOTION_NOTE, "").trim();

  if (alert.source === "port") {
    for (const [pattern, replacement] of PORT_PATTERNS) {
      if (pattern.test(message)) return message.replace(pattern, replacement);
    }
    return message;
  }

  if (alert.source === "nse") {
    const cves = cveTitle(message);
    if (cves) return cves;
  }

  const namePattern = FINDING_NAME[alert.source];
  if (namePattern) {
    const name = namePattern.exec(message)?.[1]?.trim();
    return name || FINDING_FALLBACK[alert.source];
  }

  if (alert.source === "ssh") {
    // SSH regression messages carry details after "on ip:port:" — keep those.
    return message.replace(TARGET_SUFFIX, "");
  }
  return message;
}

export interface ToolLabel {
  label: string;
  tool: string | null;
}

const SOURCE_TOOLS: Record<string, ToolLabel> = {
  port: { label: "Port scan", tool: null },
  ssh: { label: TOOL_LABELS.ssh, tool: "ssh-audit" },
  nse: { label: TOOL_LABELS.nse, tool: "NSE" },
  gvm: { label: TOOL_LABELS.gvm, tool: "GVM" },
  nuclei: { label: TOOL_LABELS.nuclei, tool: "nuclei" },
};

/** Plain label for the alert's source, with the tool name as secondary detail. */
export function alertToolLabel(alert: Alert): ToolLabel {
  return SOURCE_TOOLS[alert.source] ?? { label: alert.source, tool: null };
}
