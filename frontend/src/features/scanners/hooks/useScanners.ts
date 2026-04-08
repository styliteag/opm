import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchApi, postApi, putApi, deleteApi } from "@/lib/api";
import type { ScannerOverviewResponse } from "@/lib/types";

// useQuery for scanner list is in useDashboardData.ts (useScanners)
// This file adds detail query + mutation hooks

export function useScannerDetail(scannerId: number) {
  return useQuery({
    queryKey: ["scanners", scannerId, "overview"],
    queryFn: () =>
      fetchApi<ScannerOverviewResponse>(`/api/scanners/${scannerId}/overview`),
    enabled: scannerId > 0,
    refetchInterval: 15_000,
  });
}

export function useScannerMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      location?: string;
    }) => postApi<{ id: number; api_key: string }>("/api/scanners", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scanners"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      location?: string;
    }) => putApi(`/api/scanners/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scanners"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/scanners/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scanners"] }),
  });

  const regenerateKey = useMutation({
    mutationFn: (id: number) =>
      postApi<{ api_key: string }>(`/api/scanners/${id}/regenerate-key`, {}),
  });

  return { create, update, remove, regenerateKey };
}
