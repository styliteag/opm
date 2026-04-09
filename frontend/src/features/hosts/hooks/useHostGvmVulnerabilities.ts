import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type { VulnerabilityListResponse } from "@/lib/types";

export function useHostGvmVulnerabilities(hostId: number) {
  return useQuery({
    queryKey: ["hosts", hostId, "vulnerabilities"],
    queryFn: () =>
      fetchApi<VulnerabilityListResponse>(
        `/api/hosts/${hostId}/vulnerabilities`,
      ),
    enabled: hostId > 0,
  });
}
