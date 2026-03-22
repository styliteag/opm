/**
 * Estimate scan runtime based on CIDR, port specification, and scan rate.
 */

export function countIpsInCidr(cidr: string): number {
  const parts = cidr.trim().split('/')
  if (parts.length !== 2) return 0
  const prefix = parseInt(parts[1], 10)
  if (isNaN(prefix)) return 0

  // IPv6
  if (cidr.includes(':')) {
    if (prefix >= 128) return 1
    const hostBits = 128 - prefix
    return hostBits > 20 ? Math.pow(2, 20) : Math.pow(2, hostBits) // cap at ~1M for display
  }

  // IPv4
  if (prefix >= 32) return 1
  if (prefix >= 31) return 2
  return Math.pow(2, 32 - prefix) - 2 // subtract network + broadcast
}

export function countPortsInSpec(portSpec: string): number {
  if (!portSpec.trim()) return 0

  let count = 0
  const parts = portSpec.split(',')

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        count += end - start + 1
      }
    } else {
      const port = parseInt(trimmed, 10)
      if (!isNaN(port)) count += 1
    }
  }

  return count
}

export function estimateScanSeconds(ips: number, ports: number, pps: number): number {
  if (pps <= 0) return 0
  return (ips * ports) / pps
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return '< 1 second'
  if (seconds < 60) return `~${Math.round(seconds)} seconds`
  if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.round((seconds % 3600) / 60)
    return mins > 0 ? `~${hours}h ${mins}m` : `~${hours} hours`
  }
  const days = Math.round(seconds / 86400)
  return `~${days} days`
}

export function durationColor(seconds: number): string {
  if (seconds < 3600) return 'text-emerald-400' // < 1h
  if (seconds < 28800) return 'text-yellow-400' // 1-8h
  return 'text-red-400' // > 8h
}

export interface ScanEstimate {
  ips: number
  ports: number
  pps: number
  seconds: number
  display: string
  color: string
  tooltip: string
}

export function computeScanEstimate(cidr: string, portSpec: string, pps: number): ScanEstimate {
  const ips = countIpsInCidr(cidr)
  const ports = countPortsInSpec(portSpec)
  const seconds = estimateScanSeconds(ips, ports, pps)

  return {
    ips,
    ports,
    pps,
    seconds,
    display: formatDuration(seconds),
    color: durationColor(seconds),
    tooltip: `${ips.toLocaleString()} IPs × ${ports.toLocaleString()} ports ÷ ${pps.toLocaleString()} pps = ~${Math.round(seconds)} seconds`,
  }
}
