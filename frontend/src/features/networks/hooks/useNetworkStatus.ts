import { useMemo } from "react";

import { useAlerts } from "@/features/alerts/hooks/useAlerts";
import {
  groupPortAlerts,
  importantFindings,
} from "@/features/home/lib/homeQueue";
import { HOME_ALERT_LIMIT } from "@/features/home/hooks/useHomeData";

/**
 * Per-network counts with the same rules as Home: ports to review = open
 * port alerts grouped by IP:port, important findings = high+ finding alerts.
 */
export function useNetworkStatus(networkId: number) {
  const alerts = useAlerts({
    network_id: networkId,
    queue_state: "inbox",
    limit: HOME_ALERT_LIMIT,
  });
  return useMemo(() => {
    const list = alerts.data?.alerts ?? [];
    return {
      portsToReview: groupPortAlerts(list).length,
      importantFindings: importantFindings(list).length,
      /** True when the inbox has more alerts than one page holds. */
      truncated: (alerts.data?.total ?? 0) > list.length,
      isLoading: alerts.isLoading,
    };
  }, [alerts.data, alerts.isLoading]);
}
