import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type { ScanListResponse } from "@/lib/types";

import { buildScansQuery, type ScansQuery } from "../lib/scansQuery";

/** Recent scans across all networks (newest first), refreshed every 10 s. */
export function useRecentScans(query: ScansQuery) {
  return useQuery({
    queryKey: ["scans", "recent", query],
    queryFn: () => fetchApi<ScanListResponse>(`/api/scans?${buildScansQuery(query)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
}
