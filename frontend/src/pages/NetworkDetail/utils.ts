export const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

export const parseUtcDate = (dateStr: string) => {
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

export const formatRelativeTime = (value: Date, now: Date) => {
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

export const statusStyles: Record<string, string> = {
  planned:
    'border-slate-300/60 bg-slate-200/40 text-slate-600 dark:border-slate-600/60 dark:bg-slate-800/60 dark:text-slate-300',
  running:
    'border-sky-300/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200',
  completed:
    'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
  failed:
    'border-rose-300/50 bg-rose-500/15 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-200',
  cancelled:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
}

export const statusLabels: Record<string, string> = {
  planned: 'Planned',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const scannerTypeStyles: Record<string, string> = {
  masscan:
    'border-amber-300/50 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
  nmap: 'border-violet-300/50 bg-violet-500/15 text-violet-700 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200',
}

export const scannerTypeLabels: Record<string, string> = {
  masscan: 'Masscan',
  nmap: 'Nmap',
}

export const scanProtocolStyles: Record<string, string> = {
  tcp: 'border-sky-300/50 bg-sky-500/15 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200',
  udp: 'border-purple-300/50 bg-purple-500/15 text-purple-700 dark:border-purple-400/40 dark:bg-purple-500/20 dark:text-purple-200',
  both: 'border-emerald-300/50 bg-emerald-500/15 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
}

export const scanProtocolLabels: Record<string, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  both: 'Both',
}

export const ipVersionStyles: Record<'ipv4' | 'ipv6', string> = {
  ipv4: 'border-teal-300/50 bg-teal-500/15 text-teal-700 dark:border-teal-400/40 dark:bg-teal-500/20 dark:text-teal-200',
  ipv6: 'border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-700 dark:border-fuchsia-400/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-200',
}

export const ipVersionLabels: Record<'ipv4' | 'ipv6', string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
}

export const DEFAULT_SCAN_TIMEOUT_MINUTES = '60'
export const DEFAULT_PORT_TIMEOUT = '1500'
