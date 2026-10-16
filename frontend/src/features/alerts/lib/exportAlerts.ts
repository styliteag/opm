import { downloadAuthenticated } from "@/lib/download";

export type AlertExportFormat = "csv" | "pdf";

/** Which alerts to export, in glossary terms. */
export type AlertExportScope = "open" | "snoozed" | "expected";

// Snoozed and Expected are both dismissed; only the policy state (a matching
// Expected rule) tells them apart, so the export filters on it explicitly.
const SCOPE_PARAMS: Record<AlertExportScope, Record<string, string>> = {
  open: { queue_state: "inbox" },
  snoozed: { queue_state: "out_of_inbox", policy_state: "none" },
  expected: { policy_state: "allowed" },
};

export async function exportAlerts(
  format: AlertExportFormat,
  scope: AlertExportScope,
): Promise<void> {
  const qs = new URLSearchParams(SCOPE_PARAMS[scope]).toString();
  await downloadAuthenticated(
    `/api/alerts/export/${format}?${qs}`,
    `alerts-${scope}.${format}`,
  );
}
