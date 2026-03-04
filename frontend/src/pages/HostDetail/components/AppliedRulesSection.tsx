import type { PortRuleMatch } from '../../../types'

type Props = {
  rules: PortRuleMatch[]
  isAdmin: boolean
  onDeleteRule?: (scope: string, ruleId: number) => void
}

export default function AppliedRulesSection({ rules, isAdmin, onDeleteRule }: Props) {
  if (rules.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        Applied Port Rules ({rules.length})
      </h3>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={`${rule.scope}-${rule.id}`}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-slate-400 dark:text-slate-500 w-16 shrink-0">
                {rule.scope === 'global' ? 'Global' : rule.network_name ?? 'Network'}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  rule.rule_type === 'accepted'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                }`}
              >
                {rule.rule_type}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300 truncate">
                {rule.description || '-'}
              </span>
            </div>
            {isAdmin && onDeleteRule && (
              <button
                onClick={() => onDeleteRule(rule.scope, rule.id)}
                className="ml-2 shrink-0 px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition"
                title="Delete rule"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
