import type { PortRule } from '../../../types'

type Props = {
  rules: PortRule[]
  isLoading: boolean
  isAdmin: boolean
  onAddRule: () => void
  onDeleteRule: (rule: PortRule) => void
}

export function PortRulesSection({ rules, isLoading, isAdmin, onAddRule, onDeleteRule }: Props) {
  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-2xl text-slate-900 dark:text-white">Port Rules</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Define which ports are allowed or blocked for this network.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onAddRule}
            className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Add Rule
          </button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
        <div
          className={`grid grid-cols-1 gap-3 border-b border-slate-200/70 bg-slate-50/80 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 ${isAdmin ? 'md:grid-cols-[0.8fr_0.8fr_1.5fr_0.6fr]' : 'md:grid-cols-[0.8fr_0.8fr_1.5fr]'}`}
        >
          <span>Port</span>
          <span>Type</span>
          <span>Description</span>
          {isAdmin && <span className="text-right">Actions</span>}
        </div>
        <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
          {isLoading ? (
            <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
              Loading port rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
              No port rules defined for this network yet.
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className={`grid grid-cols-1 gap-3 px-5 py-4 text-sm ${isAdmin ? 'md:grid-cols-[0.8fr_0.8fr_1.5fr_0.6fr]' : 'md:grid-cols-[0.8fr_0.8fr_1.5fr]'}`}
              >
                <div className="flex items-center">
                  <span className="font-mono text-slate-900 dark:text-white">
                    {rule.port}
                    {rule.ip && (
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                        ({rule.ip})
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center">
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${rule.rule_type === 'allow' ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200' : 'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200'}`}
                  >
                    {rule.rule_type}
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-300">{rule.description || '—'}</div>
                {isAdmin && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule)}
                      className="rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
