import type { ScanSummary } from '../../../types'
import { formatRelativeTime, parseUtcDate } from '../utils'

type Props = {
  scan: ScanSummary
  now: Date
}

export function RunningScanProgress({ scan, now }: Props) {
  return (
    <div className="mt-6 rounded-2xl border border-sky-200/70 bg-sky-50/80 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-sky-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">Scan in progress</p>
            <p className="text-xs text-sky-600 dark:text-sky-300">
              {scan.trigger_type === 'manual' ? 'Manual scan' : 'Scheduled scan'} started{' '}
              {scan.started_at
                ? formatRelativeTime(parseUtcDate(scan.started_at), now)
                : 'just now'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-sky-700 dark:text-sky-100">
            {scan.progress_percent ?? 0}%
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-200/50 dark:bg-sky-800/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400 transition-all duration-500"
          style={{ width: `${scan.progress_percent ?? 0}%` }}
        />
      </div>
      {scan.progress_message && (
        <p className="mt-2 text-xs text-sky-600 dark:text-sky-300">{scan.progress_message}</p>
      )}
    </div>
  )
}
