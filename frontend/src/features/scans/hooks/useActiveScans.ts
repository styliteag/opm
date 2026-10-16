import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type { ScanListResponse } from "@/lib/types";

const ACTIVE_SCANS_QUERY = new URLSearchParams([
  ["status", "planned"],
  ["status", "running"],
  ["include_hidden", "true"],
  ["limit", "200"],
]).toString();

/** Planned and running scans across all networks, refreshed every 5 s. */
export function useActiveScans() {
  return useQuery({
    queryKey: ["scans", "active"],
    queryFn: () => fetchApi<ScanListResponse>(`/api/scans?${ACTIVE_SCANS_QUERY}`),
    refetchInterval: 5_000,
  });
}
