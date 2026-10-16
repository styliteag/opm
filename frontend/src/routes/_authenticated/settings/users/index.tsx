import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, ShieldCheck, ShieldOff, Pencil } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { useUsers, useUserMutations } from "@/features/admin/hooks/useAdmin";
import { CreateUserModal } from "@/features/admin/components/CreateUserModal";
import { RolesPage } from "@/features/admin/components/RolesPage";
import { HubTabs } from "@/components/layout/HubTabs";
import {
  parseUsersTab,
  USERS_TABS,
  type UsersTab,
} from "@/features/settings/settingsTabs";
import { formatRelativeTime } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/users/")({
  validateSearch: (search: Record<string, unknown>): { tab?: "roles" } => ({
    tab: parseUsersTab(search.tab),
  }),
  component: UsersRolesPage,
});

/** Settings → Users: user management + read-only roles reference. */
function UsersRolesPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab: UsersTab = tab ?? "users";

  return (
    <div className="space-y-4">
      <HubTabs
        tabs={USERS_TABS}
        active={activeTab}
        onChange={(key) =>
          void navigate({
            search: { tab: key === "roles" ? "roles" : undefined },
            replace: true,
          })
        }
      />
      {activeTab === "roles" ? <RolesPage /> : <UsersPage />}
    </div>
  );
}

const roleVariant = {
  admin: "danger" as const,
  operator: "warning" as const,
  analyst: "success" as const,
  viewer: "neutral" as const,
};

function UsersPage() {
  const { data, isLoading, error, refetch } = useUsers();
  const { update, remove } = useUserMutations();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    email: string;
  } | null>(null);

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const users = data?.users ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-strong text-foreground">Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who can sign in and which role each person has.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total users</p>
          <p className="mt-1 text-2xl font-strong text-foreground">
            {users.length}
          </p>
        </div>
        {(["admin", "operator", "analyst", "viewer"] as const).map((role) => {
          const count = users.filter((u) => u.role === role).length;
          if (count === 0) return null;
          return (
            <div
              key={role}
              className="rounded-lg border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground capitalize">
                {role}s
              </p>
              <p className="mt-1 text-2xl font-strong text-foreground">
                {count}
              </p>
            </div>
          );
        })}
      </div>

      {/* User Table */}
      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                2FA
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-border hover:bg-accent/50 transition-colors"
              >
                <td
                  className={`px-4 py-3 text-sm ${user.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}
                >
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={user.role}
                    variant={roleVariant[user.role] ?? "neutral"}
                  />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={user.is_active ? "Active" : "Inactive"}
                    variant={user.is_active ? "success" : "neutral"}
                  />
                </td>
                <td className="px-4 py-3">
                  {user.totp_enabled ? (
                    <span title="2FA enabled">
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                    </span>
                  ) : (
                    <span title="2FA not enabled">
                      <ShieldOff className="h-4 w-4 text-muted-foreground/40" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatRelativeTime(user.created_at)}
                </td>
                <td className="px-4 py-3 flex items-center gap-1">
                  <Link
                    to="/settings/users/$userId"
                    params={{ userId: String(user.id) }}
                    className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit user"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() =>
                      update.mutate(
                        { id: user.id, is_active: !user.is_active },
                        {
                          onSuccess: () =>
                            toast.success(
                              user.is_active
                                ? "User deactivated"
                                : "User activated",
                            ),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                    className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={user.is_active ? "Deactivate user" : "Activate user"}
                  >
                    {user.is_active ? (
                      <ShieldOff className="h-4 w-4" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setPendingDelete({ id: user.id, email: user.email })
                    }
                    className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserModal open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete user?"
        description={`${pendingDelete?.email ?? ""} can no longer sign in. This cannot be undone — deactivate the user instead to keep the account.`}
        confirmLabel="Delete user"
        onConfirm={() =>
          pendingDelete &&
          remove.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success("User deleted");
              setPendingDelete(null);
            },
            onError: (e) => toast.error(e.message),
          })
        }
        pending={remove.isPending}
      />
    </div>
  );
}
