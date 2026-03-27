import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type {
  AlertListResponse,
  AlertTrendDataResponse,
  HostListResponse,
  LatestScansByNetworkResponse,
  NetworkListResponse,
  ScannerListResponse,
} from "@/lib/types";

export function useNetworks() {
  return useQuery({
    queryKey: ["networks"],
    queryFn: () => fetchApi<NetworkListResponse>("/api/networks"),
  });
}

export function useScanners() {
  return useQuery({
    queryKey: ["scanners"],
    queryFn: () => fetchApi<ScannerListResponse>("/api/scanners"),
  });
}

export function useRecentAlerts(limit = 10) {
  return useQuery({
    queryKey: ["alerts", "recent", limit],
    queryFn: () =>
      fetchApi<AlertListResponse>(
        `/api/alerts/?dismissed=false&limit=${limit}`,
      ),
    refetchInterval: 30_000,
  });
}

export function useActiveAlertCount() {
  return useQuery({
    queryKey: ["alerts", "active-count"],
    queryFn: async () => {
      const data = await fetchApi<AlertListResponse>(
        "/api/alerts/?dismissed=false&limit=200",
      );
      return data.alerts.length;
    },
    refetchInterval: 30_000,
  });
}

export function useTotalHostCount() {
  return useQuery({
    queryKey: ["hosts", "total-count"],
    queryFn: async () => {
      const data = await fetchApi<HostListResponse>("/api/hosts?limit=1");
      return data.total_count;
    },
    refetchInterval: 60_000,
  });
}

export function useLatestScans() {
  return useQuery({
    queryKey: ["scans", "latest-by-network"],
    queryFn: () =>
      fetchApi<LatestScansByNetworkResponse>("/api/scans/latest-by-network"),
    refetchInterval: 30_000,
  });
}

export function useAlertTrend() {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return useQuery({
    queryKey: ["trends", "alerts", start, end],
    queryFn: () =>
      fetchApi<AlertTrendDataResponse>(
        `/api/trends/alerts?start_date=${start}&end_date=${end}&period=day`,
      ),
    refetchInterval: 60_000,
  });
}
