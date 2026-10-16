export type NetworkTab = "ports" | "scans" | "rules" | "settings";

export const NETWORK_TABS: readonly { key: NetworkTab; label: string }[] = [
  { key: "ports", label: "Ports" },
  { key: "scans", label: "Scans" },
  { key: "rules", label: "Rules" },
  { key: "settings", label: "Settings" },
];

/** Unknown or missing values fall back to the Ports tab. */
export function parseNetworkTab(value: unknown): NetworkTab {
  return NETWORK_TABS.some((t) => t.key === value)
    ? (value as NetworkTab)
    : "ports";
}
