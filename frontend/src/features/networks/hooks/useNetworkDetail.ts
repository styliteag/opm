import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi, putApi, deleteApi } from "@/lib/api";
import type {
  Network,
  NetworkOverviewResponse,
  ScanSummary,
} from "@/lib/types";

export interface HostDiscoveryScan {
  id: number;
  network_id: number;
  scanner_id: number;
  status: string;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  hosts_discovered: number;
  error_message: string | null;
}

export interface PortRule {
  id: number;
  network_id: number | null;
  rule_type: "accepted" | "critical";
  match_criteria: {
    port?: number;
    ip?: string;
    alert_type?: string;
    script_name?: string;
  };
  source?: string;
  description: string | null;
  created_at: string;
}

export function useNetworkOverview(networkId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "overview"],
    queryFn: () =>
      fetchApi<NetworkOverviewResponse>(`/api/networks/${networkId}/overview`),
    enabled: networkId > 0,
    refetchInterval: 15_000,
  });
}

export function useNetworkDetail(networkId: number) {
  return useQuery({
    queryKey: ["networks", networkId],
    queryFn: () => fetchApi<Network>(`/api/networks/${networkId}`),
    enabled: networkId > 0,
  });
}

/** Scan history of one network, hidden scans included (the API does not filter them). */
export function useNetworkScans(networkId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "scans"],
    queryFn: () =>
      fetchApi<{ scans: ScanSummary[] }>(`/api/networks/${networkId}/scans`),
    enabled: networkId > 0,
    refetchInterval: 10_000,
  });
}

export function useHostDiscoveryScans(networkId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "host-discovery-scans"],
    queryFn: () =>
      fetchApi<{ scans: HostDiscoveryScan[] }>(
        `/api/networks/${networkId}/host-discovery-scans`,
      ),
    enabled: networkId > 0,
    refetchInterval: 15_000,
  });
}

export function useNetworkRules(networkId: number) {
  return useQuery({
    queryKey: ["networks", networkId, "rules"],
    queryFn: () =>
      fetchApi<{ rules: PortRule[] }>(`/api/networks/${networkId}/rules`),
    enabled: networkId > 0,
  });
}

export function useNetworkMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (data: Partial<Network>) =>
      postApi<Network>("/api/networks", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<Network> & { id: number }) =>
      putApi<Network>(`/api/networks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/networks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  // Scan lists live under both roots: /api/scans and /api/networks/{id}/scans.
  const invalidateScans = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["scans"] }),
      qc.invalidateQueries({ queryKey: ["networks"] }),
    ]);

  const triggerScan = useMutation({
    mutationFn: (networkId: number) =>
      postApi(`/api/networks/${networkId}/scan`, {}),
    onSuccess: invalidateScans,
  });

  const triggerDiscovery = useMutation({
    mutationFn: (networkId: number) =>
      postApi(`/api/networks/${networkId}/discover-hosts`, {}),
    onSuccess: invalidateScans,
  });

  return { create, update, remove, triggerScan, triggerDiscovery };
}
