import type { SSHAlertConfig } from '../../../types'
import type { NetworkResponse } from '../types'

type Props = {
  network: NetworkResponse | null
  isAdmin: boolean
  onConfigure: () => void
}

export function SSHAlertSettingsSection({ network, isAdmin, onConfigure }: Props) {
  const alertConfig = network?.alert_config as SSHAlertConfig | null

  return (
    <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-2xl text-slate-900 dark:text-white">
            SSH Security Alert Settings
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure which SSH security issues trigger alerts for this network.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onConfigure}
            className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Configure Alerts
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AlertSettingCard
          label="Insecure Auth"
          description="Password or keyboard-interactive enabled"
          enabled={alertConfig?.ssh_insecure_auth !== false}
        />
        <AlertSettingCard
          label="Weak Ciphers"
          description="Weak encryption algorithms detected"
          enabled={alertConfig?.ssh_weak_cipher ?? false}
        />
        <AlertSettingCard
          label="Weak KEX"
          description="Weak key exchange algorithms"
          enabled={alertConfig?.ssh_weak_kex ?? false}
        />
        <AlertSettingCard
          label="Outdated Version"
          description="SSH version below threshold"
          enabled={alertConfig?.ssh_outdated_version ?? false}
        />
        <AlertSettingCard
          label="Config Regression"
          description="Security configuration degraded"
          enabled={alertConfig?.ssh_config_regression !== false}
        />
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Version Threshold
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Minimum acceptable SSH version
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-cyan-300/50 bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:border-cyan-400/40 dark:bg-cyan-500/20 dark:text-cyan-200">
              {alertConfig?.ssh_version_threshold || '8.0.0'}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function AlertSettingCard({
  label,
  description,
  enabled,
}: {
  label: string
  description: string
  enabled: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
            enabled
              ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200'
              : 'border-slate-300/50 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  )
}
