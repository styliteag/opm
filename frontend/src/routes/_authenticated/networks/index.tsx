import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Play } from 'lucide-react'
import { toast } from 'sonner'

import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { EmptyState } from '@/components/data-display/EmptyState'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { useNetworks, useScanners, useLatestScans } from '@/features/dashboard/hooks/useDashboardData'
import { useNetworkMutations } from '@/features/networks/hooks/useNetworkDetail'
import { NetworkForm } from '@/features/networks/components/NetworkForm'
import { parseUTC } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/networks/')({
  component: NetworksPage,
})

function NetworksPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const networks = useNetworks()
  const scanners = useScanners()
  const latestScans = useLatestScans()
  const { triggerScan } = useNetworkMutations()

  if (networks.isLoading) return <LoadingState rows={6} />
  if (networks.error) return <ErrorState message={networks.error.message} onRetry={() => networks.refetch()} />

  const networkList = networks.data?.networks ?? []
  const scannerMap = new Map((scanners.data?.scanners ?? []).map((s) => [s.id, s]))
  const scanMap = new Map((latestScans.data?.latest_scans ?? []).map((s) => [s.network_id, s.scan]))

  const totalCoverage = networkList.length > 0
    ? Math.round((networkList.filter((n) => scanMap.get(n.id)?.status === 'completed').length / networkList.length) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">System Configuration</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Network Definitions
          </h1>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Network
        </button>
      </div>

      {/* Scanner Status + Coverage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Scanner Status</h3>
          <div className="mt-3 space-y-2">
            {(scanners.data?.scanners ?? []).map((scanner) => {
              const isOnline = scanner.last_seen_at && Date.now() - parseUTC(scanner.last_seen_at).getTime() < 5 * 60 * 1000
              return (
                <div key={scanner.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{scanner.name}</p>
                    <p className="text-xs text-muted-foreground">{scanner.scanner_version ?? 'Unknown version'}</p>
                  </div>
                  <StatusBadge label={isOnline ? 'Online' : 'Offline'} variant={isOnline ? 'success' : 'danger'} dot />
                </div>
              )
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-sm font-semibold text-foreground">Network Coverage</h3>
          <p className="mt-2 font-display text-4xl font-bold text-foreground">{totalCoverage}%</p>
          <p className="text-sm text-muted-foreground">Total Visibility</p>
        </div>
      </div>

      {/* Network Cards */}
      {networkList.length === 0 ? (
        <EmptyState title="No networks" message="Add a network to start scanning." />
      ) : (
        <div className="space-y-4">
          {networkList.map((network) => {
            const scan = scanMap.get(network.id)
            const scanner = scannerMap.get(network.scanner_id)

            return (
              <Link
                key={network.id}
                to="/networks/$networkId"
                params={{ networkId: String(network.id) }}
                className="block rounded-lg border border-border bg-card p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {network.name}
                    </h3>
                    <p className="mt-0.5 font-mono text-sm text-primary">{network.cidr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {network.scan_schedule && (
                      <StatusBadge label="Scheduled" variant="success" />
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        triggerScan.mutate(network.id, {
                          onSuccess: () => toast.success(`Scan triggered for ${network.name}`),
                          onError: (err) => toast.error(err.message),
                        })
                      }}
                      className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20 transition-colors"
                      title="Trigger scan"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Port Spec</p>
                    <p className="text-sm text-foreground">{network.port_spec}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scan Rate</p>
                    <p className="text-sm text-foreground">{network.scan_rate ?? '-'} pps</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scanner</p>
                    <p className="text-sm text-foreground">{scanner?.name ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Scan</p>
                    <p className="text-sm text-foreground">
                      {scan?.status === 'completed' ? `${scan.port_count} ports` : scan?.status ?? 'Never'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <NetworkForm open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
