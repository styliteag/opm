import { hasRole } from "@/lib/roles";
import type { UserRole } from "@/stores/auth.store";

export interface SettingsNavEntry {
  label: string;
  href: string;
  minRole: UserRole;
}

/** Settings hub sub-navigation (ADR 0009), in display order. */
export const SETTINGS_NAV: readonly SettingsNavEntry[] = [
  { label: "Scanners", href: "/settings/scanners", minRole: "operator" },
  { label: "Rules", href: "/settings/rules", minRole: "operator" },
  { label: "Scan profiles", href: "/settings/scan-profiles", minRole: "operator" },
  { label: "Users", href: "/settings/users", minRole: "admin" },
  { label: "Organization", href: "/settings/organization", minRole: "admin" },
  { label: "System", href: "/settings/system", minRole: "admin" },
  { label: "Account", href: "/settings/security", minRole: "viewer" },
];

export function visibleSettingsNav(
  role: UserRole | undefined,
): SettingsNavEntry[] {
  return SETTINGS_NAV.filter((entry) => hasRole(role, entry.minRole));
}

/** First settings page the role may open; `/settings` lands here. */
export function defaultSettingsPath(role: UserRole | undefined): string {
  return visibleSettingsNav(role)[0]?.href ?? "/settings/security";
}
