import { createFileRoute } from "@tanstack/react-router";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { NetworkFormPage } from "@/features/networks/components/form/NetworkFormPage";
import { useNetworkDetail } from "@/features/networks/hooks/useNetworkDetail";

export const Route = createFileRoute("/_authenticated/networks/$networkId_/edit")({
  component: EditNetworkPage,
});

function EditNetworkPage() {
  const { networkId } = Route.useParams();
  const network = useNetworkDetail(Number(networkId));

  if (network.isLoading) return <LoadingState rows={6} />;
  if (network.error || !network.data)
    return (
      <ErrorState
        message={network.error?.message ?? "Network not found"}
        onRetry={() => network.refetch()}
      />
    );
  return (
    <NetworkFormPage key={network.data.id} mode="edit" network={network.data} />
  );
}
