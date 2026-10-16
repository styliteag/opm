import { createFileRoute, redirect } from "@tanstack/react-router";

// UI v4 cut-over: alert deep links open the Home slide-over (ADR 0009).
export const Route = createFileRoute("/_authenticated/alerts/$alertId")({
  beforeLoad: ({ params }) => {
    const id = Number(params.alertId);
    throw redirect({
      to: "/",
      search: Number.isInteger(id) && id > 0 ? { alert: id } : {},
    });
  },
});
