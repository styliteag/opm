import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  Scanner,
  ScannerCreateResponse,
  ScannerListResponse,
  ScannerRegenerateKeyResponse,
} from '../types'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const formatRelativeTime = (value: Date, now: Date) => {
  const diffMs = now.getTime() - value.getTime()
  if (diffMs < 0) {
    return 'Just now'
  }
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const parseUtcDate = (dateStr: string) => {
  // API returns UTC timestamps without timezone suffix, so append 'Z' to parse as UTC
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

const isOnline = (lastSeenAt: string | null, now: Date) => {
  if (!lastSeenAt) return false
  const lastSeen = parseUtcDate(lastSeenAt)
  const diffMs = now.getTime() - lastSeen.getTime()
  // Online if last seen within 5 minutes
  return diffMs < 5 * 60 * 1000
}

const Scanners = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const now = new Date()

  // Modal states
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // Form values
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [editForm, setEditForm] = useState({ name: '', description: '' })
  const [selectedScanner, setSelectedScanner] = useState<Scanner | null>(null)
  const [displayedApiKey, setDisplayedApiKey] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  const scannersQuery = useQuery({
    queryKey: ['scanners'],
    queryFn: () => fetchJson<ScannerListResponse>('/api/scanners', token ?? ''),
    enabled: Boolean(token),
  })

  const createScannerMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string | null }) => {
      const response = await fetch(`${API_BASE_URL}/api/scanners`, {
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

      return response.json() as Promise<ScannerCreateResponse>
    },
    onSuccess: async (data) => {
      setShowCreate(false)
      setFormError(null)
      setCreateForm({ name: '', description: '' })
      setDisplayedApiKey(data.api_key)
      setShowApiKey(true)
      await queryClient.invalidateQueries({ queryKey: ['scanners'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to create scanner')
    },
  })

  const updateScannerMutation = useMutation({
    mutationFn: async (payload: {
      scannerId: number
      name: string | null
      description: string | null
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/scanners/${payload.scannerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
        }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json()
    },
    onSuccess: async () => {
      setShowEdit(false)
      setFormError(null)
      setSelectedScanner(null)
      await queryClient.invalidateQueries({ queryKey: ['scanners'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to update scanner')
    },
  })

  const deleteScannerMutation = useMutation({
    mutationFn: async (scannerId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/scanners/${scannerId}`, {
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
      setSelectedScanner(null)
      await queryClient.invalidateQueries({ queryKey: ['scanners'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to delete scanner')
    },
  })

  const regenerateKeyMutation = useMutation({
    mutationFn: async (scannerId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/scanners/${scannerId}/regenerate-key`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token ?? ''),
        },
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json() as Promise<ScannerRegenerateKeyResponse>
    },
    onSuccess: async (data) => {
      setShowRegenerate(false)
      setFormError(null)
      setSelectedScanner(null)
      setDisplayedApiKey(data.api_key)
      setShowApiKey(true)
      await queryClient.invalidateQueries({ queryKey: ['scanners'] })
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to regenerate API key')
    },
  })

  const scanners = scannersQuery.data?.scanners ?? []

  const openCreateModal = () => {
    setFormError(null)
    setCreateForm({ name: '', description: '' })
    setShowCreate(true)
  }

  const openEditModal = (scanner: Scanner) => {
    setFormError(null)
    setSelectedScanner(scanner)
    setEditForm({ name: scanner.name, description: scanner.description ?? '' })
    setShowEdit(true)
  }

  const openDeleteModal = (scanner: Scanner) => {
    setFormError(null)
    setSelectedScanner(scanner)
    setShowDelete(true)
  }

  const openRegenerateModal = (scanner: Scanner) => {
    setFormError(null)
    setSelectedScanner(scanner)
    setShowRegenerate(true)
  }

  const handleCreateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token) {
      setFormError('Authentication required to create a scanner.')
      return
    }

    createScannerMutation.mutate({
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
    })
  }

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!token || !selectedScanner) {
      setFormError('Authentication required to update scanner.')
      return
    }

    updateScannerMutation.mutate({
      scannerId: selectedScanner.id,
      name: editForm.name.trim() || null,
      description: editForm.description.trim() || null,
    })
  }

  const handleDeleteConfirm = () => {
    if (!token || !selectedScanner) {
      setFormError('Authentication required to delete scanner.')
      return
    }
    deleteScannerMutation.mutate(selectedScanner.id)
  }

  const handleRegenerateConfirm = () => {
    if (!token || !selectedScanner) {
      setFormError('Authentication required to regenerate API key.')
      return
    }
    regenerateKeyMutation.mutate(selectedScanner.id)
  }

  const copyApiKey = async () => {
    if (displayedApiKey) {
      await navigator.clipboard.writeText(displayedApiKey)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const closeApiKeyModal = () => {
    setShowApiKey(false)
    setDisplayedApiKey(null)
    setCopySuccess(false)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-16 top-8 h-64 w-64 animate-drift rounded-full bg-violet-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-8 top-36 h-64 w-64 animate-drift rounded-full bg-cyan-500/15 blur-[140px]" />

      <section className="relative z-10 space-y-6">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scanners</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Scanner locations
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Manage scanner scanners and monitor their connection status. Each scanner runs a
                scanner that communicates with the backend using its API key.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {scannersQuery.isLoading
                  ? 'Refreshing scanners...'
                  : `Updated ${formatDateTime(now)}`}
              </div>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Create Scanner
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
            <div className="grid grid-cols-1 gap-4 border-b border-slate-200/70 bg-slate-50/80 px-5 py-4 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[1.5fr_2fr_0.8fr_1fr_1fr_0.8fr]">
              <span>Name</span>
              <span>Description</span>
              <span>Version</span>
              <span>Last seen</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {scannersQuery.isError ? (
                <div className="px-6 py-6 text-sm text-rose-600 dark:text-rose-200">
                  Unable to load scanners right now.
                </div>
              ) : scanners.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
                  No scanners have been added yet.
                </div>
              ) : (
                scanners.map((scanner) => {
                  const online = isOnline(scanner.last_seen_at, now)
                  const lastSeenDate = scanner.last_seen_at
                    ? parseUtcDate(scanner.last_seen_at)
                    : null
                  const lastSeenLabel = lastSeenDate
                    ? formatRelativeTime(lastSeenDate, now)
                    : 'Never'
                  const lastSeenDetail = lastSeenDate
                    ? formatDateTime(lastSeenDate)
                    : 'No scanner connection recorded'

                  return (
                    <div
                      key={scanner.id}
                      className="grid grid-cols-1 gap-4 px-5 py-4 text-sm md:grid-cols-[1.5fr_2fr_0.8fr_1fr_1fr_0.8fr]"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {scanner.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          ID: {scanner.id}
                        </p>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        {scanner.description || (
                          <span className="text-slate-400 dark:text-slate-500">No description</span>
                        )}
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        {scanner.scanner_version || (
                          <span className="text-slate-400 dark:text-slate-500">unknown</span>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-700 dark:text-slate-200">{lastSeenLabel}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {lastSeenDetail}
                        </p>
                      </div>
                      <div className="flex items-center">
                        {online ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-slate-200/40 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            Offline
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(scanner)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openRegenerateModal(scanner)}
                              className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:border-amber-600 dark:hover:bg-amber-900/30"
                            >
                              Key
                            </button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(scanner)}
                              className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:border-rose-600 dark:hover:bg-rose-900/30"
                            >
                              Delete
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

      {/* Create Scanner Modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Create scanner
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Add a scanner location
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
                Name
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="HQ Scanner"
                />
              </label>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Description (optional)
                <textarea
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Main office scanner running on VM-01"
                  rows={3}
                />
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createScannerMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {createScannerMutation.isPending ? 'Creating...' : 'Create scanner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Scanner Modal */}
      {showEdit && selectedScanner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Edit scanner
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Update {selectedScanner.name}
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
                Name
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Description (optional)
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  rows={3}
                />
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {formError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateScannerMutation.isPending}
                  className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {updateScannerMutation.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {showDelete && selectedScanner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div>
              <p className="text-xs font-semibold text-rose-500 dark:text-rose-400">
                Confirm deletion
              </p>
              <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                Delete {selectedScanner.name}?
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                This action cannot be undone. All networks assigned to this scanner will also be
                deleted along with their scan history.
              </p>
            </div>

            {formError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
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
                disabled={deleteScannerMutation.isPending}
                className="rounded-full border border-rose-600 bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {deleteScannerMutation.isPending ? 'Deleting...' : 'Delete scanner'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Regenerate API Key Confirmation Modal */}
      {showRegenerate && selectedScanner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div>
              <p className="text-xs font-semibold text-amber-500 dark:text-amber-400">
                Regenerate API key
              </p>
              <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                Generate new key for {selectedScanner.name}?
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                The old API key will be immediately invalidated. You will need to update the scanner
                configuration with the new key.
              </p>
            </div>

            {formError ? (
              <div className="mt-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowRegenerate(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegenerateConfirm}
                disabled={regenerateKeyMutation.isPending}
                className="rounded-full border border-amber-600 bg-amber-600 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {regenerateKeyMutation.isPending ? 'Generating...' : 'Regenerate key'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* API Key Display Modal */}
      {showApiKey && displayedApiKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
            <div>
              <p className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                API key generated
              </p>
              <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                Save this key now
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                This API key will only be shown once. Copy it now and store it securely. Use this
                key in your scanner's environment configuration.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <code className="flex-1 break-all font-mono text-sm text-slate-900 dark:text-slate-100">
                  {displayedApiKey}
                </code>
                <button
                  type="button"
                  onClick={copyApiKey}
                  className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    copySuccess
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                  }`}
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={closeApiKeyModal}
                className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Scanners
