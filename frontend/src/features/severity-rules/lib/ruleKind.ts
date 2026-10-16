import { TOOL_LABELS } from "@/lib/terminology";

import type { GvmSeverityRule } from "../api";

export const ACCEPTED_RISK_LABEL = "Accepted risk";

/**
 * A severity rule lowering a finding to info with a reason is what
 * "Accept risk" writes (ADR 0012), so the list shows it under that name.
 */
export function isAcceptedRisk(rule: GvmSeverityRule): boolean {
  return rule.severity_override === "info" && (rule.reason ?? "").trim() !== "";
}

const NUMERIC_OID = /^\d+(\.\d+)+$/;

/** Plain label of the engine a finding ID belongs to (secondary text). */
export function findingSourceLabel(oid: string): string {
  if (oid.startsWith("nse:")) return TOOL_LABELS.nse;
  if (NUMERIC_OID.test(oid)) return TOOL_LABELS.gvm;
  return TOOL_LABELS.nuclei;
}
