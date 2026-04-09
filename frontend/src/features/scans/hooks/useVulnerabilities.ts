import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type { VulnerabilityListResponse } from "@/lib/types";

export function useVulnerabilities(scanId: number) {
  return useQuery({
    queryKey: ["vulnerabilities", scanId],
    queryFn: () =>
      fetchApi<VulnerabilityListResponse>(
        `/api/scans/${scanId}/vulnerabilities`,
      ),
    enabled: scanId > 0,
  });
}
