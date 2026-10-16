import { useMemo } from "react";

import { useAlerts } from "@/features/alerts/hooks/useAlerts";
import {
  useLatestScans,
  useNetworks,
  useScanners,
} from "@/features/dashboard/hooks/useDashboardData";
import { useExecutiveOverview } from "@/features/overview/hooks/useExecutiveOverview";
import {
  failedNetworkScans,
  groupPortAlerts,
  importantFindings,
  offlineScanners,
} from "@/features/home/lib/homeQueue";

/** The backend caps alert pages at 200; Home works on the first page. */
export const HOME_ALERT_LIMIT = 200;

export type HomeQueueMode = "inbox" | "handled";

/** Alerts for the Home queue: the inbox, or snoozed & handled alerts. */
export function useHomeAlerts(mode: HomeQueueMode) {
  return useAlerts({
    queue_state: mode === "inbox" ? "inbox" : "out_of_inbox",
    limit: HOME_ALERT_LIMIT,
  });
}

/** Everything Home renders, derived from existing endpoints. */
export function useHomeData(mode: HomeQueueMode) {
  const alerts = useHomeAlerts(mode);
  const scanners = useScanners();
  const latestScans = useLatestScans();
  const networks = useNetworks();
  const overview = useExecutiveOverview();

  const derived = useMemo(() => {
    const list = alerts.data?.alerts ?? [];
    const names = new Map(
      (networks.data?.networks ?? []).map((n) => [n.id, n.name] as const),
    );
    return {
      groups: groupPortAlerts(list),
      findings: importantFindings(list),
      offline: offlineScanners(scanners.data?.scanners ?? []),
      failedScans: failedNetworkScans(
        latestScans.data?.latest_scans ?? [],
        names,
      ),
    };
  }, [alerts.data, scanners.data, latestScans.data, networks.data]);

  return {
    ...derived,
    networkStatus: overview.data?.networks ?? [],
    total: alerts.data?.total ?? 0,
    loaded: alerts.data?.alerts.length ?? 0,
    isLoading: alerts.isLoading,
    error: alerts.error,
    refetch: alerts.refetch,
  };
}
