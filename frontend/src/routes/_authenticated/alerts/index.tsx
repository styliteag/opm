import { createFileRoute, redirect } from "@tanstack/react-router";

// UI v4 cut-over: the alerts inbox became the Home queue (ADR 0009).
export const Route = createFileRoute("/_authenticated/alerts/")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
