import ScanEstimateSummary from '../../../../components/ScanEstimateSummary'
import type { Scanner, ScannerType } from '../../../../types'
import type { EditFormValues } from '../../types'

type Props = {
  formValues: EditFormValues
  setFormValues: React.Dispatch<React.SetStateAction<EditFormValues>>
  scanners: Scanner[]
  error: string | null
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function EditNetworkModal({
  formValues,
  setFormValues,
  scanners,
  error,
  isPending,
  onSubmit,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Edit network</p>
            <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
              Update configuration
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
          >
            Close
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Name
              <input
                type="text"
                required
                value={formValues.name}
                onChange={(e) => setFormValues((v) => ({ ...v, name: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              CIDR range
              <input
                type="text"
                required
                value={formValues.cidr}
                onChange={(e) => setFormValues((v) => ({ ...v, cidr: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Port spec
              <input
                type="text"
                required
                value={formValues.portSpec}
                onChange={(e) => setFormValues((v) => ({ ...v, portSpec: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Scan rate (pps)
              <input
                type="number"
                value={formValues.scanRate}
                onChange={(e) => setFormValues((v) => ({ ...v, scanRate: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-2">
                Max scan time (minutes)
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
                  title="Maximum total time allowed for the scan before it is stopped."
                >
                  ?
                </span>
              </span>
              <input
                type="number"
                required
                min="1"
                max="1440"
                value={formValues.scanTimeoutMinutes}
                onChange={(e) =>
                  setFormValues((v) => ({ ...v, scanTimeoutMinutes: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                placeholder="60"
              />
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Total scan runtime limit
              </span>
            </label>
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-2">
                Port timeout (milliseconds)
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
                  title="Maximum time to wait for a port response before moving on."
                >
                  ?
                </span>
              </span>
              <input
                type="number"
                required
                min="100"
                max="30000"
                value={formValues.portTimeout}
                onChange={(e) => setFormValues((v) => ({ ...v, portTimeout: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                placeholder="1500"
              />
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Range 100-30000 milliseconds
              </span>
            </label>
          </div>
          <div className="mt-4">
            <ScanEstimateSummary
              cidr={formValues.cidr}
              portSpec={formValues.portSpec}
              scanRate={formValues.scanRate}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Scanner
              <select
                required
                value={formValues.scannerId}
                onChange={(e) => setFormValues((v) => ({ ...v, scannerId: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="" disabled>
                  Select a scanner
                </option>
                {scanners.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Scanner type
              <select
                required
                value={formValues.scannerType}
                onChange={(e) =>
                  setFormValues((v) => ({ ...v, scannerType: e.target.value as ScannerType }))
                }
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="masscan">Masscan</option>
                <option value="nmap">Nmap</option>
              </select>
            </label>
            <label className="space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Cron schedule
              <input
                type="text"
                value={formValues.schedule}
                onChange={(e) => setFormValues((v) => ({ ...v, schedule: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={formValues.hostDiscoveryEnabled}
                onChange={(e) =>
                  setFormValues((v) => ({ ...v, hostDiscoveryEnabled: e.target.checked }))
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-violet-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-violet-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-violet-800" />
            </label>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enable host discovery
            </span>
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300"
              title="When enabled, periodic ping scans will discover live hosts in this network range."
            >
              ?
            </span>
          </div>
          {error && (
            <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
