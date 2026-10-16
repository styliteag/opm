import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi } from "@/lib/api";
import type { HostListResponse, HostOverviewResponse } from "@/lib/types";

interface HostFilters {
  network_id?: number;
  ip_search?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

function buildHostParams(filters: HostFilters): string {
  const params = new URLSearchParams();
  if (filters.network_id) params.set("network_id", String(filters.network_id));
  if (filters.ip_search) params.set("ip_search", filters.ip_search);
  params.set("sort_by", filters.sort_by ?? "last_seen_at");
  params.set("sort_dir", filters.sort_dir ?? "desc");
  params.set("offset", String(filters.offset ?? 0));
  params.set("limit", String(filters.limit ?? 50));
  return params.toString();
}

export function useHosts(filters: HostFilters) {
  return useQuery({
    queryKey: ["hosts", filters],
    queryFn: () =>
      fetchApi<HostListResponse>(`/api/hosts?${buildHostParams(filters)}`),
  });
}

export function useHostDetail(hostId: number) {
  return useQuery({
    queryKey: ["hosts", hostId, "overview"],
    queryFn: () =>
      fetchApi<HostOverviewResponse>(`/api/hosts/${hostId}/overview`),
    enabled: hostId > 0,
  });
}

export function useRescanHost() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (hostIp: string) =>
      postApi<{ scan_id: number; message: string }>(
        `/api/hosts/${encodeURIComponent(hostIp)}/rescan`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts"] });
    },
  });
}

interface ScanOverrides {
  port_spec: string;
  scanner_type: string;
  scan_protocol: string;
  scan_rate?: number;
  scan_timeout?: number;
  port_timeout?: number;
  nse_profile_id?: number;
}

export function useCustomScanHost() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      hostIp,
      overrides,
    }: {
      hostIp: string;
      overrides: ScanOverrides;
    }) =>
      postApi<{ scan_id: number; message: string }>(
        `/api/hosts/${encodeURIComponent(hostIp)}/rescan`,
        overrides,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts"] });
      qc.invalidateQueries({ queryKey: ["scans"] });
    },
  });
}

export function useHostMutations() {
  const qc = useQueryClient();

  const bulkDelete = useMutation({
    mutationFn: (data: { host_ids: number[] }) =>
      postApi<{ deleted: number }>("/api/hosts/bulk-delete", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hosts"] }),
  });

  return { bulkDelete };
}
