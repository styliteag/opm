import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

/**
 * Settings hub (ADR 0009). Its pages are listed as sub-entries under Settings
 * in the sidebar (filtered by role), so the layout only renders the page.
 */
function SettingsLayout() {
  return <Outlet />;
}
