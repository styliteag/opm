import type { RuleFormValues } from '../../types'

type Props = {
  formValues: RuleFormValues
  setFormValues: React.Dispatch<React.SetStateAction<RuleFormValues>>
  error: string | null
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function AddPortRuleModal({
  formValues,
  setFormValues,
  error,
  isPending,
  onSubmit,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Add rule</p>
            <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
              New port rule
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
          <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Port or range
            <input
              type="text"
              required
              placeholder="e.g., 80 or 80-443"
              value={formValues.port}
              onChange={(e) => setFormValues((v) => ({ ...v, port: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Rule type
            <select
              value={formValues.ruleType}
              onChange={(e) =>
                setFormValues((v) => ({
                  ...v,
                  ruleType: e.target.value as 'allow' | 'block',
                }))
              }
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="allow">Allow</option>
              <option value="block">Block</option>
            </select>
          </label>
          <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Description (optional)
            <input
              type="text"
              placeholder="e.g., HTTPS traffic"
              value={formValues.description}
              onChange={(e) => setFormValues((v) => ({ ...v, description: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
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
              className="rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-70 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {isPending ? 'Adding...' : 'Add rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
