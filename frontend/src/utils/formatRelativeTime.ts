/**
 * Formats a date as a relative time string (e.g., "5m ago", "2h ago", "3d ago")
 */
export const formatRelativeTime = (value: Date, now: Date = new Date()): string => {
  const diffMs = now.getTime() - value.getTime()

  if (diffMs < 0) {
    return 'Just now'
  }

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Formats a date using Intl.DateTimeFormat for locale-aware display
 */
export const formatDateTime = (value: Date): string => {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}
