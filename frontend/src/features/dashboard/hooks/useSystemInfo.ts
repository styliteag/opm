import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";

interface VersionResponse {
  version: string;
  component: string;
  migration_current: string | null;
  migration_head: string | null;
  migration_status: string;
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ["system", "version"],
    queryFn: () => fetchApi<VersionResponse>("/api/version"),
    staleTime: 5 * 60 * 1000,
  });
}
