import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { useUsers, useUserMutations } from '@/features/admin/hooks/useAdmin'
import { CreateUserModal } from '@/features/admin/components/CreateUserModal'
import { formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/admin/users')({
  component: UsersPage,
})

const roleVariant = {
  admin: 'danger' as const,
  operator: 'warning' as const,
  analyst: 'success' as const,
  viewer: 'neutral' as const,
}

function UsersPage() {
  const { data, isLoading, error, refetch } = useUsers()
  const { remove } = useUserMutations()
  const [createOpen, setCreateOpen] = useState(false)

  if (isLoading) return <LoadingState rows={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const users = data?.users ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            User Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provision access, audit login activity, and manage security roles.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Users</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{users.length}</p>
        </div>
        {(['admin', 'operator', 'analyst', 'viewer'] as const).map((role) => {
          const count = users.filter((u) => u.role === role).length
          if (count === 0) return null
          return (
            <div key={role} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground capitalize">{role}s</p>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">{count}</p>
            </div>
          )
        })}
      </div>

      {/* User Table */}
      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                <td className="px-4 py-3 text-sm text-foreground">{user.email}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={user.role} variant={roleVariant[user.role] ?? 'neutral'} />
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{formatRelativeTime(user.created_at)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() =>
                      remove.mutate(user.id, {
                        onSuccess: () => toast.success('User deleted'),
                        onError: (e) => toast.error(e.message),
                      })
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
    </div>
  )
}
