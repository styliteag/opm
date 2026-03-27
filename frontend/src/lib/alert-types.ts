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

export const RULE_SOURCE_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  port: { label: "Port", className: "bg-blue-500/10 text-blue-500" },
  ssh: { label: "SSH", className: "bg-amber-500/10 text-amber-500" },
  nse: { label: "NSE", className: "bg-purple-500/10 text-purple-500" },
};

/** Returns the human-readable label for an SSH or NSE alert type value. */
export function getAlertTypeLabel(value: string): string {
  return (
    SSH_ALERT_TYPES.find((t) => t.value === value)?.label ??
    NSE_ALERT_TYPES.find((t) => t.value === value)?.label ??
    value
  );
}
