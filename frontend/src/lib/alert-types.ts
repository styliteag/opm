/**
 * Alert type display constants shared across alerts, port-rules, and network features.
 * Types are defined in lib/types.ts; this module provides labels and groupings.
 */

export const SSH_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "ssh_insecure_auth", label: "Password login allowed" },
  { value: "ssh_weak_cipher", label: "Weak encryption" },
  { value: "ssh_weak_kex", label: "Weak key exchange" },
  { value: "ssh_outdated_version", label: "Outdated SSH version" },
  { value: "ssh_config_regression", label: "Setup got weaker" },
];

export const NSE_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "nse_vulnerability", label: "Vulnerability script finding" },
  { value: "nse_cve_detected", label: "Known CVE (vulnerability scripts)" },
];

export const GVM_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "gvm_vulnerability", label: "Deep scan finding" },
  { value: "gvm_cve_detected", label: "Known CVE (deep scan)" },
];

export const NUCLEI_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "nuclei_vulnerability", label: "Web check finding" },
  { value: "nuclei_cve_detected", label: "Known CVE (web check)" },
];

export const RULE_SOURCE_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  port: { label: "Port", className: "bg-blue-500/10 text-blue-500" },
  ssh: { label: "SSH check", className: "bg-amber-500/10 text-amber-500" },
  nse: {
    label: "Vulnerability scripts",
    className: "bg-purple-500/10 text-purple-500",
  },
  gvm: {
    label: "Deep vulnerability scan",
    className: "bg-emerald-500/10 text-emerald-500",
  },
  nuclei: {
    label: "Web vulnerability check",
    className: "bg-teal-500/10 text-teal-500",
  },
};

/** Returns the human-readable label for an SSH, NSE, GVM, or Nuclei alert type value. */
export function getAlertTypeLabel(value: string): string {
  return (
    SSH_ALERT_TYPES.find((t) => t.value === value)?.label ??
    NSE_ALERT_TYPES.find((t) => t.value === value)?.label ??
    GVM_ALERT_TYPES.find((t) => t.value === value)?.label ??
    NUCLEI_ALERT_TYPES.find((t) => t.value === value)?.label ??
    value
  );
}
