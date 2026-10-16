import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { HomePage } from "@/features/home/components/HomePage";
import { parseHomeFilters, type HomeFilters } from "@/features/home/lib/homeFilters";

interface HomeSearch extends HomeFilters {
  /** Alert opened in the details slide-over (deep link target of /alerts/$alertId). */
  alert?: number;
}

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const id = Number(search.alert);
    return {
      ...parseHomeFilters(search),
      ...(Number.isInteger(id) && id > 0 ? { alert: id } : {}),
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { alert, ...filters } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <HomePage
      selectedAlertId={alert}
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({ search: (prev) => ({ alert: prev.alert, ...next }), replace: true })
      }
      onOpenAlert={(id) => void navigate({ search: (prev) => ({ ...prev, alert: id }) })}
      onCloseAlert={() => void navigate({ search: (prev) => ({ ...prev, alert: undefined }) })}
    />
  );
}
