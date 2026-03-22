import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { PortRulesEditor } from '@/features/networks/components/PortRulesEditor'
import { NetworkForm } from '@/features/networks/components/NetworkForm'
import { useNetworkDetail, useNetworkScans, useNetworkRules } from '@/features/networks/hooks/useNetworkDetail'
import { formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/networks/$networkId')({
  component: NetworkDetailPage,
})

function NetworkDetailPage() {
  const { networkId } = Route.useParams()
  const id = Number(networkId)
  const [editOpen, setEditOpen] = useState(false)
  const network = useNetworkDetail(id)
  const scans = useNetworkScans(id)
  const rules = useNetworkRules(id)

  if (network.isLoading) return <LoadingState rows={6} />
  if (network.error) return <ErrorState message={network.error.message} onRetry={network.refetch} />
  if (!network.data) return <ErrorState message="Network not found" />

  const n = network.data
  const scanList = scans.data?.scans ?? []
  const ruleList = rules.data?.rules ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/networks" className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold text-foreground">{n.name}</h1>
          <p className="mt-0.5 font-mono text-sm text-primary">{n.cidr}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </div>

      {/* Network Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Port Spec', value: n.port_spec },
          { label: 'Scan Rate', value: `${n.scan_rate ?? '-'} pps` },
          { label: 'Protocol', value: n.scan_protocol.toUpperCase() },
          { label: 'Schedule', value: n.scan_schedule ?? 'Manual only' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Port Rules */}
      <PortRulesEditor networkId={id} rules={ruleList} />

      {/* Alert Settings */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-display text-sm font-semibold text-foreground mb-3">
          Alert Settings
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">SSH Security Scanning</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.alert_config?.ssh_enabled !== false ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Host Discovery</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.host_discovery_enabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">NSE Profile</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.nse_profile_id ? `Profile #${n.nse_profile_id}` : 'None'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">IPv6</p>
            <p className="mt-0.5 text-sm text-foreground">
              {n.is_ipv6 ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Scans */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border bg-card px-5 py-3">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Scan History ({scanList.length})
          </h3>
        </div>
        {scanList.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No scans yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {scanList.slice(0, 20).map((scan) => (
              <Link
                key={scan.id}
                to="/scans/$scanId"
                params={{ scanId: String(scan.id) }}
                className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <div>
                  <p className="text-sm text-foreground">
                    Scan #{scan.id} · {scan.port_count} ports
                  </p>
                  <p className="text-xs text-muted-foreground">{scan.trigger_type}</p>
                </div>
                <div className="text-right">
                  <StatusBadge
                    label={scan.status}
                    variant={scan.status === 'completed' ? 'success' : scan.status === 'running' ? 'warning' : scan.status === 'error' ? 'danger' : 'neutral'}
                    dot
                  />
                  {scan.completed_at && (
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(scan.completed_at)}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <NetworkForm open={editOpen} onOpenChange={setEditOpen} network={n} />
    </div>
  )
}
