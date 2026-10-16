import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  buildPortsParams,
  type PortsFilter,
} from "@/features/ports/lib/portsQuery";
import { fetchApi, patchApi } from "@/lib/api";
import type { GlobalOpenPort, GlobalOpenPortListResponse } from "@/lib/types";

export function useGlobalPortList(filter: PortsFilter) {
  return useQuery({
    queryKey: ["global-ports", filter],
    queryFn: () =>
      fetchApi<GlobalOpenPortListResponse>(
        `/api/global-ports?${buildPortsParams(filter)}`,
      ),
  });
}

/** Writes the port's "Why" (port comment); an empty value clears it. */
export function usePortComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ portId, comment }: { portId: number; comment: string }) =>
      patchApi<GlobalOpenPort>(`/api/global-ports/${portId}/comment`, {
        user_comment: comment.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-ports"] });
      qc.invalidateQueries({ queryKey: ["hosts"] });
    },
  });
}
