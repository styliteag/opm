import { createFileRoute, redirect } from "@tanstack/react-router";

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/admin/roles")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/users", search: { tab: "roles" } });
  },
});
