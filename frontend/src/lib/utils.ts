import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse an API timestamp as UTC. The backend returns ISO timestamps
 * without a timezone suffix, which browsers interpret as local time.
 * This ensures they are always treated as UTC.
 */
export function parseUTC(date: string | Date): Date {
  if (date instanceof Date) return date
  // Append 'Z' only when no timezone info is present
  return date.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(date)
    ? new Date(date)
    : new Date(date + 'Z')
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseUTC(date))
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now()
  const then = parseUTC(date).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(date)
}
