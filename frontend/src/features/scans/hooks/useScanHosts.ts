import { useMemo } from "react";

import { useHosts } from "@/features/hosts/hooks/useHosts";

/** Hosts list cap; the backend allows up to 10 000 per page. */
const HOST_LOOKUP_LIMIT = 10_000;

/** IP → host id for a network, so scan results can link to the host page. */
export function useHostIdsByIp(networkId: number): Map<string, number> {
  const hosts = useHosts({ network_id: networkId, limit: HOST_LOOKUP_LIMIT });
  return useMemo(
    () => new Map((hosts.data?.hosts ?? []).map((h) => [h.ip, h.id])),
    [hosts.data],
  );
}
