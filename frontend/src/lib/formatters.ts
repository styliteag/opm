/**
 * Shared formatting utilities used across multiple components.
 */

/** Parse a UTC date string, appending 'Z' if missing. */
export const parseUtcDate = (dateStr: string) =>
  new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

/** Format a date as medium date + short time for the user's locale. */
export const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

/** Severity badge color classes (Tailwind). */
export const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}

/** Alert type display labels. */
export const alertTypeLabels: Record<string, string> = {
  new_port: 'New Port',
  not_allowed: 'Not Allowed',
  blocked: 'Blocked',
  ssh_insecure_auth: 'SSH Insecure Auth',
  ssh_weak_cipher: 'SSH Weak Cipher',
  ssh_weak_kex: 'SSH Weak KEX',
  ssh_outdated_version: 'SSH Outdated',
  ssh_config_regression: 'SSH Regression',
}

/** Port alert type keys (non-SSH). */
export const PORT_ALERT_TYPES = new Set(['new_port', 'not_allowed', 'blocked'])
