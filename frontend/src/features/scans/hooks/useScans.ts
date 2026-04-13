import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi, patchApi, deleteApi } from "@/lib/api";
import type { ScanSummary } from "@/lib/types";

interface ScanListResponse {
  scans: ScanSummary[];
}

interface NucleiPhaseSummary {
  ran: boolean;
  findings_count: number;
  hosts_scanned: number;
  severity_counts: Record<string, number>;
  status?: string; // success, timeout, error
}

interface ScanDetail extends ScanSummary {
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

interface ScanLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface ScanLogsResponse {
  logs: ScanLogEntry[];
}

export function useScans(offset = 0, limit = 50, networkId?: number) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  if (networkId) params.set("network_id", String(networkId));
  return useQuery({
    queryKey: ["scans", offset, limit, networkId],
    queryFn: () =>
      fetchApi<ScanListResponse>(`/api/scans?${params.toString()}`),
    refetchInterval: 15_000,
  });
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

  const cancel = useMutation({
    mutationFn: (scanId: number) => postApi(`/api/scans/${scanId}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans"] }),
  });

  const remove = useMutation({
    mutationFn: (scanId: number) => deleteApi(`/api/scans/${scanId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans"] }),
  });

  const toggleVisibility = useMutation({
    mutationFn: ({ scanId, hidden }: { scanId: number; hidden: boolean }) =>
      patchApi(`/api/scans/${scanId}/visibility`, { hidden }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scans"] }),
  });

  return { cancel, remove, toggleVisibility };
}
