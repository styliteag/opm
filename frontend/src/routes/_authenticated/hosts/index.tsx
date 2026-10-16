import { createFileRoute, redirect } from "@tanstack/react-router";

interface HostsSearchParams {
  search?: string;
  network_id?: number;
}

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/hosts/")({
  validateSearch: (search: Record<string, unknown>): HostsSearchParams => ({
    search: typeof search.search === "string" ? search.search : undefined,
    network_id: search.network_id ? Number(search.network_id) : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/ports", search: { tab: "hosts", ...search } });
  },
});
