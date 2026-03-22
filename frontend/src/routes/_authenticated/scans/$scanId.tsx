import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { useScanDetail, useScanLogs, useScanMutations } from '@/features/scans/hooks/useScans'
import { ScanDiffView } from '@/features/scans/components/ScanDiffView'
import { formatDate, formatRelativeTime, parseUTC } from '@/lib/utils'

function formatRate(pps: number): string {
  if (pps >= 1_000_000) return `${(pps / 1_000_000).toFixed(1)}M pps`
  if (pps >= 1_000) return `${(pps / 1_000).toFixed(1)}k pps`
  return `${Math.round(pps)} pps`
}

export const Route = createFileRoute('/_authenticated/scans/$scanId')({
  component: ScanDetailPage,
})

function ScanDetailPage() {
  const { scanId } = Route.useParams()
  const id = Number(scanId)
  const { data, isLoading, error, refetch } = useScanDetail(id)
  const logs = useScanLogs(id)
  const { cancel } = useScanMutations()

  if (isLoading) return <LoadingState rows={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!data) return <ErrorState message="Scan not found" />

  const isActive = data.status === 'running' || data.status === 'planned'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/scans" className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Scan #{data.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.network_name ?? `Network #${data.network_id}`}
          </p>
        </div>
        <StatusBadge
          label={data.status}
          variant={data.status === 'completed' ? 'success' : data.status === 'running' ? 'warning' : data.status === 'error' ? 'danger' : 'neutral'}
          dot
        />
        {isActive && (
          <button
            onClick={() => cancel.mutate(id, {
              onSuccess: () => toast.success('Scan cancelled'),
              onError: (e) => toast.error(e.message),
            })}
            className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* Progress */}
      {isActive && data.progress_percent != null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>{data.progress_message ?? 'Scanning...'}</span>
            <span>{data.progress_percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${data.progress_percent}%` }}
            />
          </div>
          {data.actual_rate != null && data.actual_rate > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Scan rate: {formatRate(data.actual_rate)}
            </p>
          )}
        </div>
      )}

      {/* Scan Info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Ports Found', value: String(data.port_count) },
          { label: 'Trigger', value: data.trigger_type },
          { label: 'Started', value: data.started_at ? formatDate(data.started_at) : '-' },
          { label: 'Completed', value: data.completed_at ? formatDate(data.completed_at) : '-' },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Port Discovery */}
      {data.open_ports && data.open_ports.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border bg-card px-5 py-3">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Port Discovery ({data.open_ports.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">IP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Port</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Protocol</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Service</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Banner</th>
                </tr>
              </thead>
              <tbody>
                {data.open_ports.map((port, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-2 font-mono text-sm text-foreground">{port.ip}</td>
                    <td className="px-4 py-2 font-mono text-sm text-primary">{port.port}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground uppercase">{port.protocol}</td>
                    <td className="px-4 py-2 text-sm text-foreground">{port.service_guess ?? '-'}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground truncate max-w-xs">{port.banner ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scan Diff */}
      {data.status === 'completed' && <ScanDiffView scanId={data.id} />}

      {/* Engine Logs */}
      <div className="rounded-lg border border-border">
        <div className="border-b border-border bg-card px-5 py-3">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Engine Logs
          </h3>
        </div>
        <div className="max-h-96 overflow-y-auto p-4 font-mono text-xs">
          {(logs.data?.logs ?? []).length === 0 ? (
            <p className="text-muted-foreground">No logs available</p>
          ) : (
            (logs.data?.logs ?? []).map((log, i) => (
              <div key={i} className="flex gap-3 py-0.5">
                <span className="shrink-0 text-muted-foreground">
                  {parseUTC(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' ? 'text-yellow-400' : 'text-foreground'}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
