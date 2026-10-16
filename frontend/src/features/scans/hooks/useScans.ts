import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi, patchApi, deleteApi } from "@/lib/api";
import type { ScanSummary } from "@/lib/types";

interface NucleiPhaseSummary {
  ran: boolean;
  findings_count: number;
  hosts_scanned: number;
  severity_counts: Record<string, number>;
  status?: string; // success, timeout, error
}

export interface ScanDetail extends ScanSummary {
  network_name: string | null;
  scanner_name: string | null;
  open_ports: {
    ip: string;
    port: number;
    protocol: string;
    banner: string | null;
    service_guess: string | null;
  }[];
  nuclei_summary: NucleiPhaseSummary | null;
}

export interface ScanLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface ScanLogsResponse {
  logs: ScanLogEntry[];
}

export function useScanDetail(scanId: number) {
  return useQuery({
    queryKey: ["scans", scanId],
    queryFn: () => fetchApi<ScanDetail>(`/api/scans/${scanId}`),
    enabled: scanId > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "planned" ? 5_000 : false;
    },
  });
}

export function useScanLogs(scanId: number) {
  return useQuery({
    queryKey: ["scans", scanId, "logs"],
    queryFn: () =>
      fetchApi<ScanLogsResponse>(`/api/scans/${scanId}/logs?limit=3000`),
    enabled: scanId > 0,
    refetchInterval: 5_000,
  });
}

export function useScanMutations() {
  const qc = useQueryClient();
  // Scans show up under /api/scans and under /api/networks/{id}/scans.
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["scans"] }),
      qc.invalidateQueries({ queryKey: ["networks"] }),
    ]);

  const cancel = useMutation({
    mutationFn: (scanId: number) => postApi(`/api/scans/${scanId}/cancel`, {}),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (scanId: number) => deleteApi(`/api/scans/${scanId}`),
    onSuccess: invalidate,
  });

  const toggleVisibility = useMutation({
    mutationFn: ({ scanId, hidden }: { scanId: number; hidden: boolean }) =>
      patchApi(`/api/scans/${scanId}/visibility`, { hidden }),
    onSuccess: invalidate,
  });

  // Scan with a chosen NSE profile (inventory bug #1); target_ip null = whole network.
  const triggerNse = useMutation({
    mutationFn: ({ networkId, profileId }: { networkId: number; profileId: number }) =>
      postApi<{ scan_id: number }>("/api/nse/scan", {
        network_id: networkId,
        template_id: profileId,
      }),
    onSuccess: invalidate,
  });

  return { cancel, remove, toggleVisibility, triggerNse };
}
