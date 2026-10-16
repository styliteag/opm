import { createFileRoute, redirect } from "@tanstack/react-router";

// UI v4 cut-over: this route permanently redirects to its new home (ADR 0009).
export const Route = createFileRoute("/_authenticated/nse/editor/$scriptName")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/settings/scan-profiles/scripts/$scriptName",
      params: { scriptName: params.scriptName },
    });
  },
});
