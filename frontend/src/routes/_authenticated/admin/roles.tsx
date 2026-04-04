import { createFileRoute } from "@tanstack/react-router";
import { Shield, ShieldCheck, Eye, Wrench } from "lucide-react";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { useRoles } from "@/features/admin/hooks/useAdmin";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  component: RolesPage,
});

const roleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: Shield,
  operator: Wrench,
  analyst: ShieldCheck,
  viewer: Eye,
};

const roleBorderColors: Record<string, string> = {
  admin: "border-red-500/30",
  operator: "border-yellow-500/30",
  analyst: "border-primary/30",
  viewer: "border-slate-500/30",
};

function formatPermission(perm: string): string {
  return perm.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RolesPage() {
  const { data, isLoading, error, refetch } = useRoles();

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const roles = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">
          Roles & Permissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure role-based access control and system scopes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const Icon = roleIcons[role.name] ?? Shield;
          const borderColor = roleBorderColors[role.name] ?? "border-border";

          return (
            <div
              key={role.name}
              className={`rounded-lg border-2 ${borderColor} bg-card p-6`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Icon className="h-5 w-5 text-foreground" />
                <h3 className="text-lg font-strong capitalize text-foreground">
                  {role.name}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {role.description}
              </p>

              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  Permissions ({role.permissions.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {formatPermission(perm)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
