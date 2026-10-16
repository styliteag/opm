import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HomePage } from "@/features/home/components/HomePage";

interface HomeSearch {
  /** Alert opened in the details slide-over (deep link target of /alerts/$alertId). */
  alert?: number;
}

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const id = Number(search.alert);
    return Number.isInteger(id) && id > 0 ? { alert: id } : {};
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { alert } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <HomePage
      selectedAlertId={alert}
      onOpenAlert={(id) => void navigate({ search: { alert: id } })}
      onCloseAlert={() => void navigate({ search: {} })}
    />
  );
}
