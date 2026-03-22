import { describe, it, expect } from 'vitest'

import { countIpsInCidr, countPortsInSpec, estimateScanSeconds, formatDuration, durationColor, computeScanEstimate } from './scan-estimate'

describe('countIpsInCidr', () => {
  it('returns 254 for /24', () => {
    expect(countIpsInCidr('192.168.1.0/24')).toBe(254)
  })

  it('returns 1 for /32', () => {
    expect(countIpsInCidr('10.0.0.1/32')).toBe(1)
  })

  it('returns 65534 for /16', () => {
    expect(countIpsInCidr('10.0.0.0/16')).toBe(65534)
  })

  it('returns 0 for invalid CIDR', () => {
    expect(countIpsInCidr('invalid')).toBe(0)
  })

  it('handles IPv6', () => {
    expect(countIpsInCidr('2001:db8::/128')).toBe(1)
    expect(countIpsInCidr('2001:db8::/120')).toBe(256)
  })
})

describe('countPortsInSpec', () => {
  it('counts single port', () => {
    expect(countPortsInSpec('80')).toBe(1)
  })

  it('counts comma-separated ports', () => {
    expect(countPortsInSpec('22, 80, 443')).toBe(3)
  })

  it('counts port ranges', () => {
    expect(countPortsInSpec('1-1024')).toBe(1024)
  })

  it('counts mixed ranges and ports', () => {
    expect(countPortsInSpec('22, 80, 1-1024, 8000-9000')).toBe(1024 + 1001 + 2)
  })

  it('handles full range', () => {
    expect(countPortsInSpec('1-65535')).toBe(65535)
  })

  it('returns 0 for empty string', () => {
    expect(countPortsInSpec('')).toBe(0)
  })
})

describe('estimateScanSeconds', () => {
  it('calculates correctly', () => {
    expect(estimateScanSeconds(254, 2000, 5000)).toBeCloseTo(101.6)
  })

  it('returns 0 for zero pps', () => {
    expect(estimateScanSeconds(254, 2000, 0)).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(30)).toBe('~30 seconds')
  })

  it('formats minutes', () => {
    expect(formatDuration(120)).toBe('~2 minutes')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(4500)).toBe('~1h 15m')
  })

  it('formats days', () => {
    expect(formatDuration(172800)).toBe('~2 days')
  })
})

describe('durationColor', () => {
  it('returns green for < 1h', () => {
    expect(durationColor(1800)).toContain('emerald')
  })

  it('returns yellow for 1-8h', () => {
    expect(durationColor(7200)).toContain('yellow')
  })

  it('returns red for > 8h', () => {
    expect(durationColor(86400)).toContain('red')
  })
})

describe('computeScanEstimate', () => {
  it('computes full estimate', () => {
    const est = computeScanEstimate('192.168.1.0/24', '1-2000', 5000)
    expect(est.ips).toBe(254)
    expect(est.ports).toBe(2000)
    expect(est.pps).toBe(5000)
    expect(est.seconds).toBeCloseTo(101.6)
    expect(est.display).toContain('minutes')
    expect(est.color).toContain('emerald')
    expect(est.tooltip).toContain('254')
  })
})
