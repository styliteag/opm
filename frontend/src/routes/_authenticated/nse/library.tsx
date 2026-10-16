import { createFileRoute, redirect } from "@tanstack/react-router";

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/nse/library")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/scan-profiles", search: { tab: "scripts" } });
  },
});
