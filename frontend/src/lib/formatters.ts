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

/** Format a date as a relative time string (e.g., "5m ago", "2h ago"). */
export const formatRelativeTime = (value: Date, now: Date = new Date()): string => {
  const diffMs = now.getTime() - value.getTime()
  if (diffMs < 0) return 'Just now'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format duration between two UTC date strings. Uses current time if completedAt is null. */
export const formatDuration = (
  startedAt: string | null,
  completedAt: string | null,
  now: Date = new Date(),
): string => {
  if (!startedAt) return '—'
  const start = parseUtcDate(startedAt)
  const end = completedAt ? parseUtcDate(completedAt) : now
  const diffMs = end.getTime() - start.getTime()
  if (diffMs < 0) return '—'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
