import { Link } from 'react-router-dom'
import type { ScanSummary } from '../../../types'
import {
  formatDateTime,
  formatRelativeTime,
  parseUtcDate,
  statusLabels,
  statusStyles,
} from '../utils'

type Props = {
  scans: ScanSummary[]
  networkId: number
  isLoading: boolean
  lastScanDetail: string
  now: Date
}

export function RecentScansSection({ scans, networkId, isLoading, lastScanDetail, now }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-2xl text-slate-900 dark:text-white">Recent scans</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Last 10 scans for this network, ordered by most recent start time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
            {lastScanDetail}
          </div>
          <Link
            to={`/scans?network_id?=${networkId}`}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            View all scans
          </Link>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 md:grid-cols-[1fr_1.4fr_1fr_0.8fr]">
          <span>Status</span>
          <span>Timestamp</span>
          <span>Trigger</span>
          <span className="text-right">Ports</span>
        </div>
        <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
          {isLoading ? (
            <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
              Loading scan history...
            </div>
          ) : scans.length === 0 ? (
            <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
              No scans recorded for this network yet.
            </div>
          ) : (
            scans.map((scan) => {
              const scanDateRaw = scan.completed_at ?? scan.cancelled_at ?? scan.started_at
              const scanDate = scanDateRaw ? parseUtcDate(scanDateRaw) : null
              const scanLabel = scanDate ? formatRelativeTime(scanDate, now) : '—'
              const scanDetail = scanDate ? formatDateTime(scanDate) : 'Awaiting timing'
              return (
                <div
                  key={scan.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_1.4fr_1fr_0.8fr]"
                >
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${statusStyles[scan.status] ?? 'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'}`}
                    >
                      {statusLabels[scan.status] ?? 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <p className="text-slate-700 dark:text-slate-200">{scanLabel}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{scanDetail}</p>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{scan.trigger_type}</div>
                  <div className="text-right text-slate-900 dark:text-white">{scan.port_count}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
