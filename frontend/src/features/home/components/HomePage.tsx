import { useState } from "react";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ActiveScansStrip } from "@/features/home/components/ActiveScansStrip";
import { AlertSlideOver } from "@/features/home/components/AlertSlideOver";
import { HomeFilterBar } from "@/features/home/components/HomeFilterBar";
import { HomeHeader } from "@/features/home/components/HomeHeader";
import { ImportantFindings } from "@/features/home/components/ImportantFindings";
import { NetworkStatusStrip } from "@/features/home/components/NetworkStatusStrip";
import { ProblemBanners } from "@/features/home/components/ProblemBanners";
import { ReviewQueue } from "@/features/home/components/ReviewQueue";
import {
  HOME_ALERT_LIMIT,
  useHomeData,
  type HomeQueueMode,
} from "@/features/home/hooks/useHomeData";
import { hasHomeFilters, type HomeFilters } from "@/features/home/lib/homeFilters";
import { useActiveScans } from "@/features/scans/hooks/useActiveScans";

interface HomePageProps {
  /** Alert shown in the slide-over (`/?alert=<id>`). */
  selectedAlertId?: number;
  /** Network + search filter (`/?network_id=&search=`). */
  filters: HomeFilters;
  onFiltersChange: (filters: HomeFilters) => void;
  onOpenAlert: (alertId: number) => void;
  onCloseAlert: () => void;
}

/** Home (ADR 0009): new-port review queue, important findings, network status. */
export function HomePage({
  selectedAlertId,
  filters,
  onFiltersChange,
  onOpenAlert,
  onCloseAlert,
}: HomePageProps) {
  const [mode, setMode] = useState<HomeQueueMode>("inbox");
  const data = useHomeData(mode, filters);
  const activeScans = useActiveScans();
  const filtered = hasHomeFilters(filters);

  if (data.isLoading) return <LoadingState rows={8} />;
  if (data.error)
    return <ErrorState message={data.error.message} onRetry={() => void data.refetch()} />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <HomeHeader
        mode={mode}
        onModeChange={setMode}
        portCount={data.groups.length}
        findingCount={data.findings.length}
        filtered={filtered}
      />

      <HomeFilterBar value={filters} networks={data.networks} onChange={onFiltersChange} />

      {mode === "inbox" && (
        <ProblemBanners offlineScanners={data.offline} failedScans={data.failedScans} />
      )}

      <ActiveScansStrip scans={activeScans.data?.scans ?? []} />

      <ReviewQueue
        key={mode}
        groups={data.groups}
        mode={mode}
        filtered={filtered}
        onOpenDetails={onOpenAlert}
        keyboardEnabled={selectedAlertId === undefined}
      />

      {data.total > data.loaded && (
        <p className="text-xs text-muted-foreground">
          Showing the first {HOME_ALERT_LIMIT} of {data.total} alerts; the rest
          appear as the queue shrinks.
        </p>
      )}

      <ImportantFindings findings={data.findings} mode={mode} onOpenDetails={onOpenAlert} />

      <NetworkStatusStrip networks={data.networkStatus} />

      <AlertSlideOver alertId={selectedAlertId} onClose={onCloseAlert} />
    </div>
  );
}
