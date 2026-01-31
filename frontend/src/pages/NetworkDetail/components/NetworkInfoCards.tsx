import type { Scanner } from '../../../types'
import type { NetworkResponse } from '../types'
import {
  formatDateTime,
  ipVersionLabels,
  ipVersionStyles,
  parseUtcDate,
  scannerTypeLabels,
  scannerTypeStyles,
  scanProtocolLabels,
  scanProtocolStyles,
} from '../utils'

type Props = {
  network: NetworkResponse | null
  scanner: Scanner | null
  lastScanLabel: string
}

export function NetworkInfoCards({ network, scanner, lastScanLabel }: Props) {
  const ipVersionKey = network && (network.is_ipv6 ?? network.cidr.includes(':')) ? 'ipv6' : 'ipv4'

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">CIDR range</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            {network?.cidr ?? '—'}
          </p>
          {network && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${ipVersionStyles[ipVersionKey]}`}
            >
              {ipVersionLabels[ipVersionKey]}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Port specification
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {network?.port_spec ?? '—'}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scanner type</p>
        <div className="mt-2">
          {network ? (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold tracking-wide ${scannerTypeStyles[network.scanner_type] ?? scannerTypeStyles.masscan}`}
            >
              {scannerTypeLabels[network.scanner_type] ?? 'Masscan'}
            </span>
          ) : (
            <span className="text-lg font-semibold text-slate-900 dark:text-white">—</span>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scan protocol</p>
        <div className="mt-2">
          {network ? (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold tracking-wide ${scanProtocolStyles[network.scan_protocol] ?? scanProtocolStyles.tcp}`}
            >
              {scanProtocolLabels[network.scan_protocol] ?? 'TCP'}
            </span>
          ) : (
            <span className="text-lg font-semibold text-slate-900 dark:text-white">—</span>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scanner</p>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {scanner?.name ?? (network ? 'Unknown scanner' : '—')}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {scanner?.description ?? 'Assigned scanner location'}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <div className="flex gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Scan schedule
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {network?.scan_schedule || 'Manual only'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rate (pps)</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {network?.scan_rate || 'Default'}
            </p>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last scan {lastScanLabel}</p>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Created</p>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {network?.created_at ? formatDateTime(parseUtcDate(network.created_at)) : '—'}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Last updated</p>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {network?.updated_at ? formatDateTime(parseUtcDate(network.updated_at)) : '—'}
        </p>
      </div>
    </div>
  )
}
