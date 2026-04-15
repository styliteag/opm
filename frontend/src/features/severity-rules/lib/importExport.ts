import type {
  GvmSeverityRule,
  GvmSeverityRuleCreate,
  SeverityLabel,
} from "../api";

export const SEVERITY_RULES_EXPORT_VERSION = 1 as const;

export interface SeverityRuleExportEntry {
  oid: string;
  network_name: string | null;
  severity_override: SeverityLabel;
  reason: string | null;
}

export interface SeverityRulesExportFile {
  version: typeof SEVERITY_RULES_EXPORT_VERSION;
  exported_at: string;
  rules: SeverityRuleExportEntry[];
}

export function buildExport(rules: GvmSeverityRule[]): SeverityRulesExportFile {
  return {
    version: SEVERITY_RULES_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    rules: rules.map((r) => ({
      oid: r.oid,
      network_name: r.network_name,
      severity_override: r.severity_override,
      reason: r.reason,
    })),
  };
}

export function exportToDownload(rules: GvmSeverityRule[]): void {
  const payload = buildExport(rules);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.download = `severity-rules-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const SEVERITY_VALUES: SeverityLabel[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

export interface ImportResolution {
  valid: GvmSeverityRuleCreate[];
  skipped: { entry: SeverityRuleExportEntry; reason: string }[];
}

export function parseAndResolve(
  text: string,
  networks: { id: number; name: string }[],
): ImportResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }

  const rules = extractRules(parsed);
  const nameToId = new Map(networks.map((n) => [n.name, n.id]));

  const valid: GvmSeverityRuleCreate[] = [];
  const skipped: ImportResolution["skipped"] = [];

  for (const raw of rules) {
    const entry = normalizeEntry(raw);
    if (entry === null) {
      skipped.push({
        entry: raw as SeverityRuleExportEntry,
        reason: "Entry missing oid or severity_override",
      });
      continue;
    }
    let network_id: number | null = null;
    if (entry.network_name) {
      const found = nameToId.get(entry.network_name);
      if (found === undefined) {
        skipped.push({
          entry,
          reason: `Unknown network "${entry.network_name}"`,
        });
        continue;
      }
      network_id = found;
    }
    valid.push({
      oid: entry.oid,
      network_id,
      severity_override: entry.severity_override,
      reason: entry.reason,
    });
  }

  return { valid, skipped };
}

function extractRules(parsed: unknown): unknown[] {
  if (parsed && typeof parsed === "object" && "rules" in parsed) {
    const rules = (parsed as { rules: unknown }).rules;
    if (Array.isArray(rules)) return rules;
  }
  if (Array.isArray(parsed)) return parsed;
  throw new Error(
    "Expected a JSON object with a `rules` array or a top-level array.",
  );
}

function normalizeEntry(raw: unknown): SeverityRuleExportEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const oid = typeof r.oid === "string" ? r.oid.trim() : "";
  const severity =
    typeof r.severity_override === "string"
      ? r.severity_override.toLowerCase()
      : "";
  if (!oid) return null;
  if (!SEVERITY_VALUES.includes(severity as SeverityLabel)) return null;
  const network_name =
    typeof r.network_name === "string" && r.network_name.length > 0
      ? r.network_name
      : null;
  const reason =
    typeof r.reason === "string" && r.reason.length > 0 ? r.reason : null;
  return {
    oid,
    network_name,
    severity_override: severity as SeverityLabel,
    reason,
  };
}
