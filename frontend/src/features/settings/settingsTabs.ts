/**
 * Tab keys of the Settings hub pages plus the mapping from the v3 hub tab
 * keys, so old bookmarks (`/alerting?tab=severity`) land on the right tab.
 */

export const RULES_TABS = [
  { key: "ports", label: "Port rules" },
  { key: "findings", label: "Finding rules" },
  { key: "ssh", label: "SSH defaults" },
] as const;

export type RulesTab = (typeof RULES_TABS)[number]["key"];

export const SCAN_PROFILE_TABS = [
  { key: "nse", label: "Vulnerability script profiles" },
  { key: "scripts", label: "Scripts" },
  { key: "gvm", label: "Deep scan library" },
] as const;

export type ScanProfileTab = (typeof SCAN_PROFILE_TABS)[number]["key"];

export const USERS_TABS = [
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
] as const;

export type UsersTab = (typeof USERS_TABS)[number]["key"];

/** Non-default tab from a raw search value; the default tab stays out of the URL. */
export function parseRulesTab(value: unknown): RulesTab | undefined {
  return value === "findings" || value === "ssh" ? value : undefined;
}

export function parseScanProfileTab(value: unknown): ScanProfileTab | undefined {
  return value === "scripts" || value === "gvm" ? value : undefined;
}

export function parseUsersTab(value: unknown): "roles" | undefined {
  return value === "roles" ? "roles" : undefined;
}

/** v3 `/alerting?tab=` (rules | severity | ssh) → Settings → Rules tab. */
export function rulesTabFromAlerting(value: unknown): RulesTab | undefined {
  if (value === "severity") return "findings";
  if (value === "ssh") return "ssh";
  return undefined;
}

/** v3 `/scan-templates?tab=` (profiles | scripts | gvm) → Settings → Scan profiles tab. */
export function scanProfileTabFromScanTemplates(
  value: unknown,
): ScanProfileTab | undefined {
  return parseScanProfileTab(value);
}
