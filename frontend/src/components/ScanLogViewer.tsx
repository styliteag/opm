import { useMemo, useRef, useEffect } from 'react'
import type { ScanLogEntry } from '../types'
import { parseUtcDate } from '../utils/scanLogs'

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const logLevelStyles: Record<string, string> = {
  info: 'text-slate-700 dark:text-slate-200',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-rose-600 dark:text-rose-400',
}

const logLevelBadgeStyles: Record<string, string> = {
  info: 'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300',
  warning:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  error:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
}

export type ScanLogViewerProps = {
  /** Array of scan log entries to display */
  logs: ScanLogEntry[]
  /** Whether the scan is currently running (enables auto-scroll) */
  isRunning?: boolean
  /** Whether logs are currently loading */
  isLoading?: boolean
  /** Whether there was an error loading logs */
  isError?: boolean
  /** Maximum height of the log container (default: 500px) */
  maxHeight?: string
  /** Title to display in the header */
  title?: string
  /** Whether to show the header section */
  showHeader?: boolean
  /** Callback to open the raw logs view (e.g., new window) */
  onShowRaw?: () => void
}

export const ScanLogViewer = ({
  logs,
  isRunning = false,
  isLoading = false,
  isError = false,
  maxHeight = '500px',
  title = 'Scan Logs',
  showHeader = true,
  onShowRaw,
}: ScanLogViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const aTime = parseUtcDate(a.timestamp).getTime()
      const bTime = parseUtcDate(b.timestamp).getTime()
      return aTime - bTime
    })
  }, [logs])

  // Auto-scroll to bottom when scan is running and new logs arrive
  useEffect(() => {
    if (isRunning && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [sortedLogs, isRunning])

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading logs...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
        Unable to load scan logs.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {showHeader && (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
            {isRunning && (
              <span className="ml-3 inline-flex items-center gap-2 text-sm font-normal text-sky-600 dark:text-sky-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
                </span>
                Live
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {logs.length === 0 ? 'No log entries yet' : `${logs.length} entries`}
            </span>
            {onShowRaw && (
              <button
                onClick={onShowRaw}
                disabled={logs.length === 0}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Show Raw Logs
              </button>
            )}
          </div>
        </div>
      )}

      {/* Logs Container */}
      <div
        ref={containerRef}
        className="overflow-y-auto rounded-2xl border border-slate-200/70 bg-slate-50/30 font-mono text-sm dark:border-slate-800/70 dark:bg-slate-900/30"
        style={{ maxHeight }}
      >
        {sortedLogs.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
            No logs available.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
            {sortedLogs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(parseUtcDate(log.timestamp))}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      logLevelBadgeStyles[log.level] ?? logLevelBadgeStyles.info
                    }`}
                  >
                    {log.level}
                  </span>
                </div>
                <span
                  className={`flex-1 break-all ${logLevelStyles[log.level] ?? logLevelStyles.info}`}
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ScanLogViewer
