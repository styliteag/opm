import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, ChevronDown } from 'lucide-react'

import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { EmptyState } from '@/components/data-display/EmptyState'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import { AlertsTable } from '@/features/alerts/components/AlertsTable'
import { AlertFilters } from '@/features/alerts/components/AlertFilters'
import { useAlerts, useAlertMutations } from '@/features/alerts/hooks/useAlerts'
import { useNetworks } from '@/features/dashboard/hooks/useDashboardData'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AlertType, Severity } from '@/lib/types'

export const Route = createFileRoute('/_authenticated/alerts/')({
  component: AlertsPage,
})

interface FilterState {
  severity?: Severity
  type?: AlertType
  network_id?: number
  dismissed?: boolean
}

function AlertsPage() {
  const [filters, setFilters] = useState<FilterState>({ dismissed: false })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [page, setPage] = useState(0)
  const limit = 50

  const alerts = useAlerts({ ...filters, offset: page * limit, limit })
  const networks = useNetworks()
  const [showNetworkPicker, setShowNetworkPicker] = useState(false)
  const { bulkDismiss, bulkAcceptGlobal, bulkAcceptNetwork } = useAlertMutations()

  const alertList = alerts.data?.alerts ?? []
  const criticalCount = alertList.filter((a) => a.severity === 'critical').length
  const highCount = alertList.filter((a) => a.severity === 'high').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Alert Triage Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Intelligence-led prioritization of surface findings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SeverityBadge severity="critical" />
            <span className="text-sm font-medium text-foreground">{criticalCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity="high" />
            <span className="text-sm font-medium text-foreground">{highCount}</span>
          </div>
          <a
            href="/api/alerts/export/csv"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        </div>
      </div>

      <AlertFilters
        filters={filters}
        onChange={(f) => {
          setFilters(f)
          setPage(0)
        }}
        networks={(networks.data?.networks ?? []).map((n) => ({
          id: n.id,
          name: n.name,
        }))}
      />

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm text-primary">
            {selectedIds.length} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90 transition-colors"
            >
              Bulk Actions
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  bulkDismiss.mutate(
                    { alert_ids: selectedIds, reason: 'Bulk dismissed' },
                    { onSuccess: () => setSelectedIds([]) },
                  )
                }}
              >
                Bulk Dismiss
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  bulkAcceptGlobal.mutate(
                    { alert_ids: selectedIds, reason: 'Bulk accepted globally' },
                    { onSuccess: () => setSelectedIds([]) },
                  )
                }}
              >
                Accept Globally
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowNetworkPicker(true)}
              >
                Accept for Network
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {showNetworkPicker && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
          <span className="text-sm text-foreground">Select network:</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
            onChange={(e) => {
              const networkId = Number(e.target.value)
              if (networkId > 0) {
                bulkAcceptNetwork.mutate(
                  { alert_ids: selectedIds, network_id: networkId, reason: 'Bulk accepted for network' },
                  {
                    onSuccess: () => {
                      setSelectedIds([])
                      setShowNetworkPicker(false)
                    },
                  },
                )
              }
            }}
          >
            <option value="" disabled>
              Choose a network...
            </option>
            {(networks.data?.networks ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowNetworkPicker(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {alerts.isLoading ? (
        <LoadingState rows={8} />
      ) : alerts.error ? (
        <ErrorState message={alerts.error.message} onRetry={() => alerts.refetch()} />
      ) : alertList.length === 0 ? (
        <EmptyState title="No alerts" message="No alerts match the current filters." />
      ) : (
        <>
          <AlertsTable
            alerts={alertList}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * limit + 1}-{page * limit + alertList.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={alertList.length < limit}
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
