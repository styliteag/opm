const IPV4_MAX_BITS = 32
const IPV6_MAX_BITS = 128
const DEFAULT_PORT_RANGE = '1-65535'

type HostInfo = {
  hostCount: bigint
  totalBits: number
}

type ScanEstimateInput = {
  cidr: string
  portSpec: string
  rate: number | null
}

export type ScanEstimate = {
  hostLabel: string
  portLabel: string
  rateLabel: string
  durationLabel: string
}

const formatBigIntWithCommas = (value: bigint): string => {
  const digits = value.toString().split('').reverse()
  const chunks: string[] = []
  for (let i = 0; i < digits.length; i += 3) {
    chunks.push(
      digits
        .slice(i, i + 3)
        .reverse()
        .join(''),
    )
  }
  return chunks.reverse().join(',')
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)

const formatDuration = (seconds: bigint): string => {
  const units: Array<{ label: string; seconds: bigint }> = [
    { label: 'y', seconds: 31536000n },
    { label: 'd', seconds: 86400n },
    { label: 'h', seconds: 3600n },
    { label: 'm', seconds: 60n },
    { label: 's', seconds: 1n },
  ]
  const parts: string[] = []
  let remaining = seconds
  for (const unit of units) {
    if (unit.seconds === 0n) {
      continue
    }
    const value = remaining / unit.seconds
    if (value > 0n) {
      parts.push(`${value.toString()}${unit.label}`)
      remaining -= value * unit.seconds
    }
  }
  return parts.length > 0 ? parts.join(' ') : '0s'
}

const parseHostInfo = (cidr: string): HostInfo | null => {
  const trimmed = cidr.trim()
  if (!trimmed) {
    return null
  }
  const slashIndex = trimmed.indexOf('/')
  if (slashIndex === -1) {
    return null
  }
  const prefix = Number.parseInt(trimmed.slice(slashIndex + 1), 10)
  if (Number.isNaN(prefix)) {
    return null
  }
  const addressPart = trimmed.slice(0, slashIndex)
  const isIpv6 = addressPart.includes(':')
  const totalBits = isIpv6 ? IPV6_MAX_BITS : IPV4_MAX_BITS
  if (prefix < 0 || prefix > totalBits) {
    return null
  }
  const hostBits = totalBits - prefix
  const hostCount = hostBits <= 0 ? 1n : 1n << BigInt(hostBits)
  return { hostCount, totalBits }
}

const parsePortCount = (portSpec: string): number => {
  const tokens = portSpec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('!'))
  const normalizedTokens = tokens.length > 0 ? tokens : [DEFAULT_PORT_RANGE]

  const seen = new Set<number>()
  for (const token of normalizedTokens) {
    const normalized = token.includes(':') ? token.slice(token.indexOf(':') + 1) : token
    const rangeResult = countPortsInRange(normalized)
    if (rangeResult.set) {
      for (const port of rangeResult.set) {
        seen.add(port)
      }
    }
  }

  if (seen.size === 0) {
    const fallback = countPortsInRange(DEFAULT_PORT_RANGE)
    return fallback.set ? fallback.set.size : 0
  }

  return seen.size
}

type PortRangeResult = {
  set?: Set<number>
}

const countPortsInRange = (value: string): PortRangeResult => {
  const ports = new Set<number>()
  const rangeParts = value.split('-').map((segment) => segment.trim())
  const parsePort = (text: string): number | null => {
    if (!text) {
      return null
    }
    const parsed = Number.parseInt(text, 10)
    if (Number.isNaN(parsed)) {
      return null
    }
    if (parsed < 1) {
      return 1
    }
    if (parsed > 65535) {
      return 65535
    }
    return parsed
  }

  if (rangeParts.length === 1) {
    const port = parsePort(rangeParts[0])
    if (port !== null) {
      ports.add(port)
    }
    return { set: ports }
  }

  const start = parsePort(rangeParts[0])
  const end = parsePort(rangeParts[1])
  if (start === null || end === null) {
    return { set: ports }
  }
  const rangeStart = Math.min(start, end)
  const rangeEnd = Math.max(start, end)
  for (let port = rangeStart; port <= rangeEnd; port += 1) {
    ports.add(port)
  }
  return { set: ports }
}

export const getScanEstimate = ({ cidr, portSpec, rate }: ScanEstimateInput): ScanEstimate => {
  const hostInfo = parseHostInfo(cidr)
  const hostLabel = hostInfo
    ? `${formatBigIntWithCommas(hostInfo.hostCount)} IP${hostInfo.hostCount === 1n ? '' : 's'}`
    : 'Enter a valid CIDR'
  const portCount = parsePortCount(portSpec)
  const portLabel = `${formatNumber(portCount)} port${portCount === 1 ? '' : 's'}`

  const validRate = rate && Number.isFinite(rate) && rate > 0 ? rate : null
  const rateLabel = validRate ? `${formatNumber(validRate)} pps` : 'Rate not configured'

  let durationLabel: string
  if (!hostInfo) {
    durationLabel = 'CIDR required to estimate duration'
  } else if (!validRate) {
    durationLabel = 'Set scan rate to estimate duration'
  } else {
    const totalProbes = hostInfo.hostCount * BigInt(portCount)
    const rateBigInt = BigInt(validRate)
    const seconds = totalProbes / rateBigInt
    const hasPartial = totalProbes % rateBigInt !== 0n
    const timeLabel = seconds === 0n && hasPartial ? '<1s' : formatDuration(seconds)
    durationLabel = `~${timeLabel} at ${rateLabel}`
  }

  return {
    hostLabel,
    portLabel,
    rateLabel,
    durationLabel,
  }
}
