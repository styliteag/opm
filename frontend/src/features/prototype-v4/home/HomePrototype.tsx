// PROTOTYPE (UI v4) — Home variants on the existing "/" route via ?variant=A|B|C.
// Question: which Home layout makes "which ports are new and are they okay?" fastest?
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { useAlerts } from "@/features/alerts/hooks/useAlerts";
import { useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { useExecutiveOverview } from "@/features/overview/hooks/useExecutiveOverview";
import { parseUTC } from "@/lib/utils";

import { PrototypeSwitcher } from "../PrototypeSwitcher";
import { groupPortAlerts, importantFindings } from "../protoData";
import { HomeVariantA } from "./HomeVariantA";
import { HomeVariantB } from "./HomeVariantB";
import { HomeVariantC } from "./HomeVariantC";
import type { HomeData } from "./types";

const VARIANTS = [
  { key: "A", label: "Queue list" },
  { key: "B", label: "Board by network" },
  { key: "C", label: "One at a time" },
];

export function HomePrototype({ variant }: { variant: string }) {
  const alerts = useAlerts({ queue_state: "inbox", limit: 200 });
  const overview = useExecutiveOverview();
  const scanners = useScanners();

  if (alerts.isLoading || overview.isLoading || scanners.isLoading)
    return <LoadingState rows={8} />;
  const error = alerts.error || overview.error || scanners.error;
  if (error) return <ErrorState message={error.message} />;

  const all = alerts.data?.alerts ?? [];
  const offline = (scanners.data?.scanners ?? []).filter(
    (s) =>
      !s.last_seen_at ||
      new Date().getTime() - parseUTC(s.last_seen_at).getTime() > 5 * 60 * 1000,
  );
  const data: HomeData = {
    groups: groupPortAlerts(all),
    findings: importantFindings(all),
    networks: overview.data?.networks ?? [],
    offlineScanners: offline.map((s) => s.name),
    rawPortAlertCount: all.filter((a) => a.source === "port").length,
  };

  return (
    <>
      {variant === "B" ? (
        <HomeVariantB data={data} />
      ) : variant === "C" ? (
        <HomeVariantC data={data} />
      ) : (
        <HomeVariantA data={data} />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
