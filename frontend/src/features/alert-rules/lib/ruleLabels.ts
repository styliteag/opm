import { PORT_STATUS, TOOL_LABELS } from "@/lib/terminology";

import type { PortRule } from "../types";

export type RuleType = PortRule["rule_type"];
export type RuleTypeFilter = RuleType | "all";

/** Glossary labels for the two rule types (API names stay accepted/critical). */
export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  accepted: PORT_STATUS.expected.label,
  critical: PORT_STATUS.critical.label,
};

const SOURCE_LABELS: Record<string, string> = {
  port: "Port",
  ssh: TOOL_LABELS.ssh,
  nse: TOOL_LABELS.nse,
  nuclei: TOOL_LABELS.nuclei,
  gvm: TOOL_LABELS.gvm,
};

/** Plain label for a rule source (ADR 0010); unknown sources read as Port. */
export function ruleSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? SOURCE_LABELS.port;
}

export function filterRulesByType(
  rules: readonly PortRule[],
  filter: RuleTypeFilter,
): PortRule[] {
  return filter === "all"
    ? [...rules]
    : rules.filter((r) => r.rule_type === filter);
}

export function countRulesByType(
  rules: readonly PortRule[],
): Record<RuleTypeFilter, number> {
  const accepted = rules.filter((r) => r.rule_type === "accepted").length;
  return {
    all: rules.length,
    accepted,
    critical: rules.length - accepted,
  };
}
