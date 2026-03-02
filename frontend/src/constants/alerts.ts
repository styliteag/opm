/**
 * Alert type display labels
 */
export const ALERT_TYPE_LABELS: Record<string, string> = {
  new_port: 'New Port',
  not_allowed: 'Not Allowed',
  blocked: 'Blocked',
  ssh_insecure_auth: 'SSH Insecure Auth',
  ssh_weak_cipher: 'SSH Weak Cipher',
  ssh_weak_kex: 'SSH Weak KEX',
  ssh_outdated_version: 'SSH Outdated',
  ssh_config_regression: 'SSH Regression',
}

/**
 * Alert type styling classes (for Alerts page)
 */
export const ALERT_TYPE_STYLES: Record<string, string> = {
  new_port:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  not_allowed:
    'border-orange-300/50 bg-orange-500/15 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/20 dark:text-orange-200',
  blocked:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
  ssh_insecure_auth:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
  ssh_weak_cipher:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  ssh_weak_kex:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  ssh_outdated_version:
    'border-orange-300/50 bg-orange-500/15 text-orange-700 dark:border-orange-400/40 dark:bg-orange-500/20 dark:text-orange-200',
  ssh_config_regression:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
}

/**
 * Alert type styling classes (for Home page - slightly different styling)
 */
export const ALERT_TYPE_STYLES_COMPACT: Record<string, string> = {
  new_port: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-200 border-cyan-400/30',
  not_allowed: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-400/30',
  blocked: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/30',
  ssh_insecure_auth: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/30',
  ssh_weak_cipher: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-400/30',
  ssh_weak_kex: 'bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-400/30',
  ssh_outdated_version: 'bg-orange-500/15 text-orange-700 dark:text-orange-200 border-orange-400/30',
  ssh_config_regression: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/30',
}

/**
 * Compact alert labels for Home page
 */
export const ALERT_TYPE_LABELS_COMPACT: Record<string, string> = {
  new_port: 'New port',
  not_allowed: 'Not allowed',
  blocked: 'Blocked',
  ssh_insecure_auth: 'SSH insecure auth',
  ssh_weak_cipher: 'SSH weak cipher',
  ssh_weak_kex: 'SSH weak KEX',
  ssh_outdated_version: 'SSH outdated',
  ssh_config_regression: 'SSH regression',
}

const FALLBACK_STYLE =
  'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300'

const FALLBACK_STYLE_COMPACT =
  'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-400/30'

/**
 * Auto-generate a human-readable label from a snake_case alert type.
 */
function formatAlertType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Get alert label with fallback for unknown types. */
export function getAlertLabel(type: string): string {
  return ALERT_TYPE_LABELS[type] ?? formatAlertType(type)
}

/** Get alert style with fallback for unknown types. */
export function getAlertStyle(type: string): string {
  return ALERT_TYPE_STYLES[type] ?? FALLBACK_STYLE
}

/** Get compact alert style with fallback for unknown types. */
export function getAlertStyleCompact(type: string): string {
  return ALERT_TYPE_STYLES_COMPACT[type] ?? FALLBACK_STYLE_COMPACT
}

/** Get compact alert label with fallback for unknown types. */
export function getAlertLabelCompact(type: string): string {
  return ALERT_TYPE_LABELS_COMPACT[type] ?? formatAlertType(type)
}
