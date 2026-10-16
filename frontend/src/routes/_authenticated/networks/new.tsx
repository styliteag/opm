import { createFileRoute } from "@tanstack/react-router";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { NetworkFormPage } from "@/features/networks/components/form/NetworkFormPage";
import { useNetworkDetail } from "@/features/networks/hooks/useNetworkDetail";

type NewNetworkSearch = {
  /** Network id to copy every setting from. */
  clone?: number;
};

export const Route = createFileRoute("/_authenticated/networks/new")({
  validateSearch: (search: Record<string, unknown>): NewNetworkSearch => {
    const clone = Number(search.clone);
    return Number.isInteger(clone) && clone > 0 ? { clone } : {};
  },
  component: NewNetworkPage,
});

function NewNetworkPage() {
  const { clone } = Route.useSearch();
  const source = useNetworkDetail(clone ?? 0);

  if (!clone) return <NetworkFormPage mode="create" />;
  if (source.isLoading) return <LoadingState rows={6} />;
  if (source.error || !source.data)
    return (
      <ErrorState
        message={source.error?.message ?? "Network not found"}
        onRetry={() => source.refetch()}
      />
    );
  // Remount per source so the form picks up fresh defaults.
  return (
    <NetworkFormPage key={clone} mode="create" cloneSource={source.data} />
  );
}
