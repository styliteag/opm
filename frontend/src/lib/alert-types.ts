/**
 * Alert type display constants shared across alerts, port-rules, and network features.
 * Types are defined in lib/types.ts; this module provides labels and groupings.
 */

export const SSH_ALERT_TYPES: { value: string; label: string }[] = [
  {
    value: "ssh_insecure_auth",
    label: "Insecure Auth (password/keyboard-interactive)",
  },
  { value: "ssh_weak_cipher", label: "Weak Ciphers" },
  { value: "ssh_weak_kex", label: "Weak Key Exchange" },
  { value: "ssh_outdated_version", label: "Outdated SSH Version" },
  { value: "ssh_config_regression", label: "Configuration Regression" },
];

export const NSE_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "nse_vulnerability", label: "NSE Vulnerability" },
  { value: "nse_cve_detected", label: "CVE Detected" },
];

export const GVM_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "gvm_vulnerability", label: "GVM Vulnerability" },
  { value: "gvm_cve_detected", label: "GVM CVE Detected" },
];

export const NUCLEI_ALERT_TYPES: { value: string; label: string }[] = [
  { value: "nuclei_vulnerability", label: "Nuclei Vulnerability" },
  { value: "nuclei_cve_detected", label: "Nuclei CVE Detected" },
];

export const RULE_SOURCE_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  port: { label: "Port", className: "bg-blue-500/10 text-blue-500" },
  ssh: { label: "SSH", className: "bg-amber-500/10 text-amber-500" },
  nse: { label: "NSE", className: "bg-purple-500/10 text-purple-500" },
  gvm: { label: "GVM", className: "bg-emerald-500/10 text-emerald-500" },
  nuclei: { label: "Nuclei", className: "bg-teal-500/10 text-teal-500" },
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
