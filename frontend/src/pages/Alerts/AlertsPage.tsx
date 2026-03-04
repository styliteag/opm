import React, { useState, useEffect } from 'react'
import AckModal from '../../components/AckModal'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, getAuthHeaders } from '../../lib/api'
import type { Alert } from '../../types'
import AlertFilters from './AlertFilters'
import AlertTableHeader from './AlertTableHeader'
import AlertRow from './AlertRow'
import AlertExpandedRow from './AlertExpandedRow'
import { useAlerts } from './useAlerts'
import type {
  Severity,
  StatusFilter,
  SortColumn,
  SortDirection,
  AlertFiltersState,
} from './useAlerts'

type ActionModalState = {
  alerts: Alert[]
  mode: 'single' | 'bulk'
} | null

const AlertsPage = () => {
  const { token } = useAuth()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [actionModal, setActionModal] = useState<ActionModalState>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [editingComment, setEditingComment] = useState<{
    hostId: number
    comment: string
    ip: string
  } | null>(null)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [updatingAssignment, setUpdatingAssignment] = useState<number | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<Severity | ''>('')
  const [networkFilter, setNetworkFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assignedUserFilter, setAssignedUserFilter] = useState<number | 'all' | 'unassigned'>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const filters: AlertFiltersState = {
    searchQuery,
    severityFilter,
    networkFilter,
    statusFilter,
    assignedUserFilter,
    sortColumn,
    sortDirection,
  }

  const {
    isAdmin,
    isLoading,
    filteredAlerts,
    networks,
    users,
    portMap,
    isAlertAccepted,
    bulkWhitelistGlobalMutation,
    bulkWhitelistNetworkMutation,
    bulkAcknowledgeMutation,
    singleAcknowledgeMutation,
    unacknowledgeMutation,
    assignAlertMutation,
    updateCommentMutation,
    rescanHostMutation,
    createRuleMutation,
  } = useAlerts(filters)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredAlerts.filter((a) => !a.acknowledged).map((a) => a.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (alertId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(alertId)
      else next.delete(alertId)
      return next
    })
  }

  const toggleRow = (alertId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(alertId)) next.delete(alertId)
      else next.add(alertId)
      return next
    })
  }

  const unacknowledgedCount = filteredAlerts.filter((a) => !a.acknowledged).length
  const allUnackSelected =
    unacknowledgedCount > 0 &&
    filteredAlerts.filter((a) => !a.acknowledged).every((a) => selectedIds.has(a.id))

  // AckModal callbacks
  const handleAckOnly = (reason: string, includeSSH: boolean) => {
    if (!actionModal) return
    if (actionModal.mode === 'single') {
      const alert = actionModal.alerts[0]
      singleAcknowledgeMutation.mutate(
        {
          alertId: alert.id,
          reason: reason || undefined,
          include_ssh_findings: alert.related_ssh_alert_count > 0 && includeSSH,
        },
        {
          onSuccess: () => {
            setToast({ message: 'Alert acknowledged.', tone: 'success' })
            setActionModal(null)
            setSelectedIds(new Set())
          },
        },
      )
    } else {
      bulkAcknowledgeMutation.mutate(
        { alertIds: actionModal.alerts.map((a) => a.id), reason: reason || undefined },
        {
          onSuccess: () => {
            setToast({ message: 'Alerts acknowledged.', tone: 'success' })
            setActionModal(null)
            setSelectedIds(new Set())
          },
        },
      )
    }
  }

  const handleAcceptGlobal = (reason: string, _includeSSH: boolean) => {
    if (!actionModal || !reason.trim()) return
    const alertIds = actionModal.alerts.map((a) => a.id)
    bulkWhitelistGlobalMutation.mutate(
      { alertIds, reason },
      {
        onSuccess: () => {
          setToast({ message: 'Global rules committed and alerts acknowledged.', tone: 'success' })
          setActionModal(null)
          setSelectedIds(new Set())
        },
      },
    )
  }

  const handleAcceptNetwork = (reason: string, _includeSSH: boolean) => {
    if (!actionModal || !reason.trim()) return
    const alertIds = actionModal.alerts.map((a) => a.id)
    bulkWhitelistNetworkMutation.mutate(
      { alertIds, reason },
      {
        onSuccess: () => {
          setToast({ message: 'Network rules committed and alerts acknowledged.', tone: 'success' })
          setActionModal(null)
          setSelectedIds(new Set())
        },
      },
    )
  }

  const handleExport = async (format: 'csv' | 'pdf') => {
    setIsExporting(true)
    setExportDropdownOpen(false)
    try {
      const queryParams = new URLSearchParams()
      if (severityFilter) queryParams.append('type', severityFilter)
      if (statusFilter === 'pending') queryParams.append('acknowledged', 'false')
      else if (statusFilter === 'monitoring') queryParams.append('acknowledged', 'true')

      const url = `${API_BASE_URL}/api/alerts/export/${format}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
      const response = await fetch(url, { headers: getAuthHeaders(token ?? '') })
      if (!response.ok) throw new Error(await extractErrorMessage(response))

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `alerts_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
      setToast({ message: 'Alerts exported successfully', tone: 'success' })
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Export failed', tone: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  const handleAssign = (alertId: number, userId: number | null) => {
    setUpdatingAssignment(alertId)
    assignAlertMutation.mutate(
      { alertId, userId },
      {
        onSuccess: () => {
          setToast({ message: 'Assignment updated', tone: 'success' })
          setUpdatingAssignment(null)
        },
        onError: (e) => {
          setToast({ message: e instanceof Error ? e.message : 'Error', tone: 'error' })
          setUpdatingAssignment(null)
        },
      },
    )
  }

  const isProcessing =
    bulkWhitelistGlobalMutation.isPending ||
    bulkWhitelistNetworkMutation.isPending ||
    bulkAcknowledgeMutation.isPending ||
    singleAcknowledgeMutation.isPending

  return (
    <div className="relative">
      {toast && (
        <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div
            className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Security Overview
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">Alerts</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Unified view of all security alerts across your monitored networks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAdmin && selectedIds.size > 0 && (
                <button
                  onClick={() => {
                    const selected = filteredAlerts.filter((a) => selectedIds.has(a.id))
                    setActionModal({ alerts: selected, mode: 'bulk' })
                  }}
                  className="rounded-full border border-indigo-200 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300"
                >
                  Resolve ({selectedIds.size})
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                  disabled={isExporting}
                  className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300 disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export'}
                </button>
                {exportDropdownOpen && !isExporting && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl border border-slate-200/70 bg-white shadow-lg dark:border-slate-800/70 dark:bg-slate-900">
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-t-2xl transition"
                    >
                      Export as CSV
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-b-2xl transition"
                    >
                      Export as PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <AlertFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              severityFilter={severityFilter}
              onSeverityChange={setSeverityFilter}
              networkFilter={networkFilter}
              onNetworkChange={setNetworkFilter}
              assignedUserFilter={assignedUserFilter}
              onAssignedUserChange={setAssignedUserFilter}
              networks={networks}
              users={users}
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <table className="w-full">
              <AlertTableHeader
                isAdmin={isAdmin}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                allUnackSelected={allUnackSelected}
                onSelectAll={(checked) => handleSelectAll(checked)}
              />
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {isLoading ? (
                  <tr>
                    <td colSpan={isAdmin ? 11 : 10} className="px-4 py-6 text-sm text-slate-500">
                      Loading security context...
                    </td>
                  </tr>
                ) : filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 11 : 10} className="px-4 py-6 text-sm text-slate-500">
                      No alerts found.
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((alert) => {
                    const isExpanded = expandedRows.has(alert.id)
                    const portData = alert.global_open_port_id
                      ? (portMap.get(alert.global_open_port_id) ?? null)
                      : null

                    return (
                      <React.Fragment key={alert.id}>
                        <AlertRow
                          alert={alert}
                          isAdmin={isAdmin}
                          isExpanded={isExpanded}
                          isSelected={selectedIds.has(alert.id)}
                          isAccepted={isAlertAccepted(alert)}
                          onToggle={() => toggleRow(alert.id)}
                          onSelect={(checked) => handleSelectOne(alert.id, checked)}
                          onResolve={() => setActionModal({ alerts: [alert], mode: 'single' })}
                          onReopen={(id) =>
                            unacknowledgeMutation.mutate(id, {
                              onSuccess: () =>
                                setToast({ message: 'Alert reopened', tone: 'success' }),
                              onError: (e) =>
                                setToast({
                                  message: e instanceof Error ? e.message : 'Error',
                                  tone: 'error',
                                }),
                            })
                          }
                          isReopening={unacknowledgeMutation.isPending}
                          users={users}
                          onAssign={handleAssign}
                          isAssigning={updatingAssignment === alert.id}
                        />
                        {isExpanded && (
                          <AlertExpandedRow
                            alert={alert}
                            portData={portData}
                            isAdmin={isAdmin}
                            colSpan={isAdmin ? 11 : 10}
                            networks={networks}
                            onRescan={(ip) =>
                              rescanHostMutation.mutate(ip, {
                                onSuccess: (_, ip) =>
                                  setToast({
                                    message: `Rescan started for ${ip}`,
                                    tone: 'success',
                                  }),
                                onError: (e) =>
                                  setToast({
                                    message: e instanceof Error ? e.message : 'Error',
                                    tone: 'error',
                                  }),
                              })
                            }
                            isRescanPending={rescanHostMutation.isPending}
                            onEditComment={(hostId, comment, ip) =>
                              setEditingComment({ hostId, comment, ip })
                            }
                            onCreateRule={(payload) =>
                              createRuleMutation.mutate(payload, {
                                onSuccess: () =>
                                  setToast({ message: 'Rule created', tone: 'success' }),
                                onError: (e) =>
                                  setToast({
                                    message: e instanceof Error ? e.message : 'Error',
                                    tone: 'error',
                                  }),
                              })
                            }
                            isCreatingRule={createRuleMutation.isPending}
                            onToast={(message, tone) => setToast({ message, tone })}
                          />
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* AckModal */}
      {actionModal && (
        <AckModal
          alerts={actionModal.alerts.map((a) => ({
            id: a.id,
            ip: a.ip,
            port: a.port,
            network_id: a.network_id,
            network_name: a.network_name,
            related_ssh_alert_count: a.related_ssh_alert_count,
            related_ssh_alerts_acknowledged: a.related_ssh_alerts_acknowledged,
          }))}
          mode={actionModal.mode}
          onAcknowledgeOnly={handleAckOnly}
          onAcceptGlobal={handleAcceptGlobal}
          onAcceptNetwork={handleAcceptNetwork}
          onClose={() => setActionModal(null)}
          isProcessing={isProcessing}
        />
      )}

      {/* Comment Edit Modal */}
      {editingComment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4">
          <div className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] w-full max-w-2xl border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden">
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
              Edit Host Comment
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Host:{' '}
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {editingComment.ip}
              </span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateCommentMutation.mutate(
                  { hostId: editingComment.hostId, comment: editingComment.comment.trim() || null },
                  {
                    onSuccess: () => {
                      setToast({ message: 'Comment updated', tone: 'success' })
                      setEditingComment(null)
                    },
                    onError: (err) =>
                      setToast({
                        message: err instanceof Error ? err.message : 'Error',
                        tone: 'error',
                      }),
                  },
                )
              }}
              className="mt-8 space-y-6"
            >
              <textarea
                value={editingComment.comment}
                onChange={(e) => setEditingComment({ ...editingComment, comment: e.target.value })}
                placeholder="Add a comment about this host..."
                className="w-full border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-2xl px-6 py-4 text-sm font-medium focus:ring-4 ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all min-h-32"
              />
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setEditingComment(null)}
                  className="text-[11px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-[0.2em] transition-all px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateCommentMutation.isPending}
                  className="flex-1 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  {updateCommentMutation.isPending ? 'Saving...' : 'Save Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AlertsPage
