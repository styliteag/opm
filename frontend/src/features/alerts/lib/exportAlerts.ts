import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth.store";

export type AlertExportFormat = "csv" | "pdf";

/**
 * Downloads the alert export (raw fetch: the payload is a file, not JSON).
 * The export endpoint predates queue_state, so the queue maps onto its
 * dismissed param.
 */
export async function exportAlerts(
  format: AlertExportFormat,
  filters: { dismissed?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.dismissed !== undefined)
    params.set("dismissed", String(filters.dismissed));
  const qs = params.toString();
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api/alerts/export/${format}${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error(`Export failed: ${res.statusText}`);
    return;
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `alerts.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}
