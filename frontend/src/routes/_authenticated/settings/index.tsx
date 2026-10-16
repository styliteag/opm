import { createFileRoute, Navigate } from "@tanstack/react-router";

import { defaultSettingsPath } from "@/features/settings/settingsNav";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: SettingsIndex,
});

// Resolved in the component, not beforeLoad: the user (and role) is only
// known once the authenticated layout has loaded /auth/me.
function SettingsIndex() {
  const role = useAuthStore((s) => s.user?.role);
  return <Navigate to={defaultSettingsPath(role)} replace />;
}
