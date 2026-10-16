import { createFileRoute } from "@tanstack/react-router";

import { HostDetailPage } from "@/features/hosts/components/HostDetailPage";

export const Route = createFileRoute("/_authenticated/hosts/$hostId")({
  component: HostRoute,
});

function HostRoute() {
  const { hostId } = Route.useParams();
  return <HostDetailPage hostId={Number(hostId)} />;
}
