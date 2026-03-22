import { useQuery } from '@tanstack/react-query'
import { Plus, Minus } from 'lucide-react'

import { fetchApi } from '@/lib/api'

interface ScanDiffPort {
  ip: string
  port: number
  protocol: string
  service_guess: string | null
  change: 'added' | 'removed' | 'unchanged'
}

interface ScanDiffResponse {
  current_scan_id: number
  previous_scan_id: number
  added: ScanDiffPort[]
  removed: ScanDiffPort[]
  unchanged: ScanDiffPort[]
}

interface ScanDiffViewProps {
  scanId: number
}

export function ScanDiffView({ scanId }: ScanDiffViewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['scans', scanId, 'diff'],
    queryFn: () => fetchApi<ScanDiffResponse>(`/api/scans/${scanId}/diff`),
    enabled: scanId > 0,
  })

  if (isLoading) return <div className="animate-pulse h-32 rounded-lg bg-card" />
  if (!data) return null

  const hasChanges = data.added.length > 0 || data.removed.length > 0

  if (!hasChanges) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-center text-sm text-muted-foreground">
        No changes since previous scan
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-card px-5 py-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Port Changes vs Previous Scan
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          +{data.added.length} added · -{data.removed.length} removed
        </p>
      </div>
      <div className="divide-y divide-border">
        {data.added.map((port) => (
          <div key={`add-${port.ip}:${port.port}`} className="flex items-center gap-3 px-5 py-2 bg-emerald-500/5">
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-sm text-emerald-400">
              {port.ip}:{port.port}/{port.protocol}
            </span>
            {port.service_guess && (
              <span className="text-xs text-muted-foreground">{port.service_guess}</span>
            )}
          </div>
        ))}
        {data.removed.map((port) => (
          <div key={`rm-${port.ip}:${port.port}`} className="flex items-center gap-3 px-5 py-2 bg-red-500/5">
            <Minus className="h-3.5 w-3.5 text-red-400" />
            <span className="font-mono text-sm text-red-400">
              {port.ip}:{port.port}/{port.protocol}
            </span>
            {port.service_guess && (
              <span className="text-xs text-muted-foreground">{port.service_guess}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
