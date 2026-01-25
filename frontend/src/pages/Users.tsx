import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type { User, UserListResponse, UserRole } from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) => {
  // API returns UTC timestamps without timezone suffix, so append 'Z' to parse as UTC
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

const roleStyles: Record<UserRole, string> = {
  admin:
    'border-amber-300/60 bg-amber-100/70 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200',
  viewer:
    'border-slate-300/60 bg-slate-200/60 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300',
}

const Users = () => {
  const { token, user, loading } = useAuth()
  const queryClient = useQueryClient()
  const now = new Date()

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    role: 'viewer' as UserRole,
  })
  const [editForm, setEditForm] = useState({
    role: 'viewer' as UserRole,
    password: '',
  })
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<UserListResponse>('/api/users', token ?? ''),
    enabled: Boolean(token && isAdmin),
  })

  const createUserMutation = useMutation({
    mutationFn: async (payload: { email: string; password: string; role: UserRole }) => {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json() as Promise<User>
    },
    onSuccess: async () => {
      setShowCreate(false)
      setFormError(null)
      setCreateForm({ email: '', password: '', role: 'viewer' })
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to create user')
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: async (payload: { userId: number; role: UserRole; password: string | null }) => {
      const response = await fetch(`${API_BASE_URL}/api/users/${payload.userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify({
          role: payload.role,
          password: payload.password,
        }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json() as Promise<User>
    },
    onSuccess: async () => {
      setShowEdit(false)
      setFormError(null)
      setSelectedUser(null)
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to update user')
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      setShowDelete(false)
      setFormError(null)
      setSelectedUser(null)
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to delete user')
    },
  })

  if (!loading && !isAdmin) {
    return <Navigate to="/" replace />
  }

  const users = usersQuery.data?.users ?? []

  const openCreateModal = () => {
    setFormError(null)
    setCreateForm({ email: '', password: '', role: 'viewer' })
    setShowCreate(true)
  }

  const openEditModal = (target: User) => {
    setFormError(null)
    setSelectedUser(target)
    setEditForm({ role: target.role, password: '' })
    setShowEdit(true)
  }

  const openDeleteModal = (target: User) => {
    if (target.id === user?.id) {
      return
    }
    setFormError(null)
    setSelectedUser(target)
    setShowDelete(true)
  }

  const handleCreateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token) {
      setFormError('Authentication required to create users.')
      return
    }

    createUserMutation.mutate({
      email: createForm.email.trim(),
      password: createForm.password,
      role: createForm.role,
    })
  }

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token || !selectedUser) {
      setFormError('Authentication required to update users.')
      return
    }

    updateUserMutation.mutate({
      userId: selectedUser.id,
      role: editForm.role,
      password: editForm.password.trim() ? editForm.password : null,
    })
  }

  const handleDeleteConfirm = () => {
    if (!token || !selectedUser) {
      setFormError('Authentication required to delete users.')
      return
    }
    if (selectedUser.id === user?.id) {
      setFormError('You cannot delete your own account.')
      return
    }
    deleteUserMutation.mutate(selectedUser.id)
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-slate-200/70 bg-white/80 text-sm text-slate-500 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-300">
        Checking user permissions...
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 animate-drift rounded-full bg-amber-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-8 top-36 h-64 w-64 animate-drift rounded-full bg-cyan-500/15 blur-[140px]" />

      <section className="relative z-10 space-y-6">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Users</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Team access
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Manage who can access the dashboard. Admins can create accounts, adjust roles, and
                reset passwords as needed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {usersQuery.isLoading ? 'Refreshing users...' : `Updated ${formatDateTime(now)}`}
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Create User
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
            <div className="grid grid-cols-1 gap-4 border-b border-slate-200/70 bg-slate-50/80 px-5 py-4 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[2.2fr_1fr_1fr_0.8fr]">
              <span>Email</span>
              <span>Role</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {usersQuery.isError ? (
                <div className="px-6 py-6 text-sm text-rose-600 dark:text-rose-200">
                  Unable to load users right now.
                </div>
              ) : users.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No users have been added yet.
                </div>
              ) : (
                users.map((entry) => {
                  const createdAt = parseUtcDate(entry.created_at)
                  const isCurrent = entry.id === user?.id

                  return (
                    <div
                      key={entry.id}
                      className="grid grid-cols-1 gap-4 px-5 py-4 text-sm md:grid-cols-[2.2fr_1fr_1fr_0.8fr]"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {entry.email}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">ID: {entry.id}</p>
                      </div>
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                            roleStyles[entry.role]
                          }`}
                        >
                          {entry.role}
                        </span>
                      </div>
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">
                          {formatDateTime(createdAt)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Joined</p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(entry)}
                              disabled={isCurrent}
                              className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                                isCurrent
                                  ? 'cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                                  : 'border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:border-rose-600 dark:hover:bg-rose-900/30'
                              }`}
                            >
                              {isCurrent ? 'Current' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            View only
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Create user
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Invite a teammate
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreateSubmit}>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Email
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </label>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Temporary password
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                />
              </label>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Role
                <select
                  value={createForm.role}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      role: event.target.value as UserRole,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                >
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEdit && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Edit user
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Update access
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleEditSubmit}>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Email
                <input
                  type="email"
                  value={selectedUser.email}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400"
                />
              </label>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Role
                <select
                  value={editForm.role}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      role: event.target.value as UserRole,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
                >
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Reset password
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Leave blank to keep current"
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showDelete && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200/70 bg-white/95 p-6 shadow-2xl dark:border-rose-700/60 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-rose-500">Delete user</p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Remove access
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>
                You are about to remove{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedUser.email}
                </span>{' '}
                from the dashboard.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This action cannot be undone.
              </p>
            </div>

            {formError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteUserMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400"
              >
                {deleteUserMutation.isPending ? 'Deleting...' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Users
