import { useMemo, useState } from 'react'
import { X, Zap, Clock, Search } from 'lucide-react'
import { toast } from 'sonner'

import { useUiStore } from '@/stores/ui.store'
import { useNetworks } from '@/features/dashboard/hooks/useDashboardData'
import { useNseProfiles } from '@/features/nse/hooks/useNse'
import { useNetworkMutations } from '@/features/networks/hooks/useNetworkDetail'
import { computeScanEstimate } from '@/lib/scan-estimate'

type ScanType = 'port' | 'nse' | 'discovery'

export function QuickScanModal() {
  const isOpen = useUiStore((s) => s.quickScanModalOpen)
  const close = useUiStore((s) => s.closeQuickScan)
  const [selectedNetwork, setSelectedNetwork] = useState<number | ''>('')
  const [scanType, setScanType] = useState<ScanType>('port')
  const [selectedProfile, setSelectedProfile] = useState<number | ''>('')

  const networks = useNetworks()
  const profiles = useNseProfiles()
  const { triggerScan, triggerDiscovery } = useNetworkMutations()

  const selectedNet = useMemo(
    () => (networks.data?.networks ?? []).find((n) => n.id === selectedNetwork),
    [networks.data, selectedNetwork],
  )

  const estimate = useMemo(() => {
    if (!selectedNet) return null
    const pps = selectedNet.scan_rate ?? 1000
    return computeScanEstimate(selectedNet.cidr, selectedNet.port_spec, pps)
  }, [selectedNet])

  if (!isOpen) return null

  const handleScan = () => {
    if (!selectedNetwork) return
    if (scanType === 'nse' && !selectedProfile) {
      toast.error('Select an NSE profile')
      return
    }
    const onSuccess = () => {
      toast.success(scanType === 'discovery' ? 'Host discovery triggered' : 'Scan triggered successfully')
      close()
      setSelectedNetwork('')
      setScanType('port')
      setSelectedProfile('')
    }
    const onError = (err: Error) => {
      toast.error(err.message)
    }
    const networkId = Number(selectedNetwork)
    if (scanType === 'discovery') {
      triggerDiscovery.mutate(networkId, { onSuccess, onError })
    } else {
      triggerScan.mutate(networkId, { onSuccess, onError })
    }
  }

  const isPending = triggerScan.isPending || triggerDiscovery.isPending

  const selectClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Quick Scan
          </h2>
          <button
            onClick={close}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Select Network
            </label>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value ? Number(e.target.value) : '')}
              className={selectClass}
            >
              <option value="">Choose a network...</option>
              {(networks.data?.networks ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.cidr})
                </option>
              ))}
            </select>
          </div>

          {estimate && scanType === 'port' && (
            <div className="rounded-md border border-border bg-accent/50 p-3" title={estimate.tooltip}>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Est. Runtime:</span>
                <span className={`font-medium ${estimate.color}`}>{estimate.display}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {estimate.ips.toLocaleString()} IPs &times; {estimate.ports.toLocaleString()} ports @ {estimate.pps.toLocaleString()} pps
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Scan Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScanType('port')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  scanType === 'port'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                Port Scan
              </button>
              <button
                type="button"
                onClick={() => setScanType('discovery')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  scanType === 'discovery'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                Host Discovery
              </button>
              <button
                type="button"
                onClick={() => setScanType('nse')}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  scanType === 'nse'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                NSE Vulnerability
              </button>
            </div>
          </div>

          {scanType === 'nse' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                NSE Profile
              </label>
              <select
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value ? Number(e.target.value) : '')}
                className={selectClass}
              >
                <option value="">Choose a profile...</option>
                {(profiles.data?.profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.nse_scripts.length} scripts)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleScan}
            disabled={!selectedNetwork || (scanType === 'nse' && !selectedProfile) || isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanType === 'discovery' ? <Search className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
            {isPending
              ? 'Starting...'
              : scanType === 'nse'
                ? 'Start NSE Scan'
                : scanType === 'discovery'
                  ? 'Start Host Discovery'
                  : 'Start Port Scan'}
          </button>
        </div>
      </div>
    </div>
  )
}
