import { downloadAuthenticated } from "@/lib/download";

export type AlertExportFormat = "csv" | "pdf";

/**
 * Downloads the alert export. The export endpoint predates queue_state, so
 * the queue maps onto its dismissed param.
 */
export async function exportAlerts(
  format: AlertExportFormat,
  filters: { dismissed?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.dismissed !== undefined)
    params.set("dismissed", String(filters.dismissed));
  const qs = params.toString();
  await downloadAuthenticated(
    `/api/alerts/export/${format}${qs ? `?${qs}` : ""}`,
    `alerts.${format}`,
  );
}
