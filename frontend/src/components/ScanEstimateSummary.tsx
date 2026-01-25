import { useMemo } from 'react'
import { getScanEstimate } from '../utils/scanEstimate'

type ScanEstimateSummaryProps = {
  cidr: string
  portSpec: string
  scanRate: string
}

const ScanEstimateSummary = ({ cidr, portSpec, scanRate }: ScanEstimateSummaryProps) => {
  const numericRate = useMemo(() => {
    const trimmed = scanRate.trim()
    if (!trimmed) {
      return null
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }, [scanRate])

  const estimate = useMemo(
    () => getScanEstimate({ cidr, portSpec, rate: numericRate }),
    [cidr, portSpec, numericRate],
  )

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-xs text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-300">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Scan estimate
      </p>
      <div className="mt-2 text-sm text-slate-900 dark:text-white">
        <p className="text-[13px]">
          Network size:{' '}
          <span className="font-mono text-slate-900 dark:text-slate-100">{estimate.hostLabel}</span>
        </p>
        <p className="text-[13px]">
          Ports:{' '}
          <span className="font-mono text-slate-900 dark:text-slate-100">{estimate.portLabel}</span>
        </p>
        <p className="text-[13px]">
          Rate:{' '}
          <span className="font-mono text-slate-900 dark:text-slate-100">{estimate.rateLabel}</span>
        </p>
      </div>
      <p className="mt-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
        {estimate.durationLabel}
      </p>
    </div>
  )
}

export default ScanEstimateSummary
