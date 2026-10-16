import { useMemo } from "react";

import { useHostGvmVulnerabilities } from "@/features/hosts/hooks/useHostGvmVulnerabilities";
import { useHostVulnerabilities } from "@/features/hosts/hooks/useHostVulnerabilities";
import {
  mergeHostFindings,
  type HostFinding,
} from "@/features/hosts/lib/hostFindings";
import type { HostAlertSummary } from "@/lib/types";

/** All findings of a host (GVM + nuclei + NSE + open SSH alerts) as one list. */
export function useHostFindings(
  hostId: number,
  ip: string,
  openAlerts: HostAlertSummary[],
): { findings: HostFinding[]; isLoading: boolean; error: Error | null } {
  const vulns = useHostGvmVulnerabilities(hostId);
  const nse = useHostVulnerabilities(ip);

  const findings = useMemo(
    () =>
      mergeHostFindings({
        vulns: vulns.data?.results ?? [],
        nseResults: nse.data?.results ?? [],
        alerts: openAlerts,
      }),
    [vulns.data, nse.data, openAlerts],
  );

  return {
    findings,
    isLoading: vulns.isLoading || nse.isLoading,
    error: vulns.error ?? nse.error,
  };
}
