import type { SSHAlertConfig } from '../../../../types'

type Props = {
  alertSettings: SSHAlertConfig
  setAlertSettings: React.Dispatch<React.SetStateAction<SSHAlertConfig>>
  error: string | null
  isPending: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function AlertSettingsModal({
  alertSettings,
  setAlertSettings,
  error,
  isPending,
  onSubmit,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div
        className="w-full max-w-xl overflow-auto rounded-3xl border border-slate-200/70 bg-white/95 p-6 shadow-2xl dark:border-slate-800/70 dark:bg-slate-950"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Alert settings
            </p>
            <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
              SSH Security Alerts
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
        <form className="mt-6 space-y-5" onSubmit={onSubmit}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose which SSH security issues should trigger alerts for this network.
          </p>

          <ToggleRow
            label="Password/keyboard-interactive authentication"
            description="Alert when SSH allows insecure authentication methods (HIGH severity)"
            checked={alertSettings.ssh_insecure_auth ?? true}
            onChange={(checked) => setAlertSettings((v) => ({ ...v, ssh_insecure_auth: checked }))}
          />

          <ToggleRow
            label="Weak ciphers detected"
            description="Alert when weak encryption algorithms are enabled (MEDIUM severity)"
            checked={alertSettings.ssh_weak_cipher ?? false}
            onChange={(checked) => setAlertSettings((v) => ({ ...v, ssh_weak_cipher: checked }))}
          />

          <ToggleRow
            label="Weak key exchange algorithms"
            description="Alert when weak KEX algorithms are enabled (MEDIUM severity)"
            checked={alertSettings.ssh_weak_kex ?? false}
            onChange={(checked) => setAlertSettings((v) => ({ ...v, ssh_weak_kex: checked }))}
          />

          <ToggleRow
            label="Outdated SSH version"
            description="Alert when SSH version is below threshold (MEDIUM severity)"
            checked={alertSettings.ssh_outdated_version ?? false}
            onChange={(checked) =>
              setAlertSettings((v) => ({ ...v, ssh_outdated_version: checked }))
            }
          />

          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800/70 dark:bg-slate-900/60">
            <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              SSH version threshold
              <input
                type="text"
                placeholder="e.g., 8.0.0"
                value={alertSettings.ssh_version_threshold ?? '8.0.0'}
                onChange={(e) =>
                  setAlertSettings((v) => ({ ...v, ssh_version_threshold: e.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                Minimum acceptable SSH version (default: 8.0.0)
              </span>
            </label>
          </div>

          <ToggleRow
            label="Configuration regression"
            description="Alert when SSH security configuration degrades between scans (HIGH severity)"
            checked={alertSettings.ssh_config_regression ?? true}
            onChange={(checked) =>
              setAlertSettings((v) => ({ ...v, ssh_config_regression: checked }))
            }
          />

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
              {isPending ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800/70 dark:bg-slate-900/60">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-cyan-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:border-slate-600 dark:bg-slate-700 dark:peer-focus:ring-cyan-800" />
      </label>
    </div>
  )
}
