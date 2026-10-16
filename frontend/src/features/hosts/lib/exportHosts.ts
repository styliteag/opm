import { downloadAuthenticated } from "@/lib/download";

/** Host inventory CSV; the backend export filters by network only. */
export async function exportHostsCsv(networkId?: number): Promise<void> {
  const qs = networkId ? `?network_id=${networkId}` : "";
  await downloadAuthenticated(`/api/hosts/export/csv${qs}`, "hosts.csv");
}
