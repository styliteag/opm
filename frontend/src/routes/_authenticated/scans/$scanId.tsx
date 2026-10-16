import { createFileRoute } from "@tanstack/react-router";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ScanDetailPage } from "@/features/scans/components/ScanDetailPage";
import { useScanDetail } from "@/features/scans/hooks/useScans";

export const Route = createFileRoute("/_authenticated/scans/$scanId")({
  component: ScanDetailRoute,
});

function ScanDetailRoute() {
  const { scanId } = Route.useParams();
  const { data, isLoading, error, refetch } = useScanDetail(Number(scanId));

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Scan not found" />;
  return <ScanDetailPage scan={data} />;
}
