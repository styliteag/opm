import { createFileRoute, Navigate, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useAuthStore } from "@/stores/auth.store";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <p className="text-6xl font-emphasis text-muted-foreground">404</p>
      <p className="text-sm text-tertiary">This page doesn't exist.</p>
      <Link to="/" className="text-sm text-accent hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}

function AuthenticatedLayout() {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { isLoading } = useCurrentUser();

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-sm text-muted-foreground">
            Checking session...
          </p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
