import type { AlertType } from '../types'

/**
 * Alert type display labels
 */
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
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
export const ALERT_TYPE_STYLES: Record<AlertType, string> = {
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
export const ALERT_TYPE_STYLES_COMPACT: Record<AlertType, string> = {
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
export const ALERT_TYPE_LABELS_COMPACT: Record<AlertType, string> = {
  new_port: 'New port',
  not_allowed: 'Not allowed',
  blocked: 'Blocked',
  ssh_insecure_auth: 'SSH insecure auth',
  ssh_weak_cipher: 'SSH weak cipher',
  ssh_weak_kex: 'SSH weak KEX',
  ssh_outdated_version: 'SSH outdated',
  ssh_config_regression: 'SSH regression',
}
