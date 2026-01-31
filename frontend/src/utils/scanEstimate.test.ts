import { describe, it, expect } from 'vitest'
import { getScanEstimate } from './scanEstimate'

describe('getScanEstimate', () => {
  describe('host count calculation', () => {
    it('should calculate hosts for /24 network', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('256 IPs')
    })

    it('should calculate hosts for /32 (single host)', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.1/32',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('1 IP')
    })

    it('should calculate hosts for /16 network', () => {
      const result = getScanEstimate({
        cidr: '10.0.0.0/16',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('65,536 IPs')
    })

    it('should handle IPv6 CIDR', () => {
      const result = getScanEstimate({
        cidr: '2001:db8::/120',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('256 IPs')
    })

    it('should return error message for invalid CIDR', () => {
      const result = getScanEstimate({
        cidr: 'invalid',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('Enter a valid CIDR')
    })

    it('should return error message for empty CIDR', () => {
      const result = getScanEstimate({
        cidr: '',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.hostLabel).toBe('Enter a valid CIDR')
    })
  })

  describe('port count calculation', () => {
    it('should count single port', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.portLabel).toBe('1 port')
    })

    it('should count multiple ports', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '22,80,443',
        rate: 1000,
      })

      expect(result.portLabel).toBe('3 ports')
    })

    it('should count port range', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80-100',
        rate: 1000,
      })

      expect(result.portLabel).toBe('21 ports')
    })

    it('should handle mixed port spec', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '22,80-82,443',
        rate: 1000,
      })

      expect(result.portLabel).toBe('5 ports')
    })

    it('should ignore excluded ports (starting with !)', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80,443,!8080',
        rate: 1000,
      })

      expect(result.portLabel).toBe('2 ports')
    })

    it('should deduplicate overlapping ports', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80,80,80',
        rate: 1000,
      })

      expect(result.portLabel).toBe('1 port')
    })
  })

  describe('rate label', () => {
    it('should format rate with pps suffix', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.rateLabel).toBe('1,000 pps')
    })

    it('should handle null rate', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: null,
      })

      expect(result.rateLabel).toBe('Rate not configured')
    })

    it('should handle zero rate', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: 0,
      })

      expect(result.rateLabel).toBe('Rate not configured')
    })
  })

  describe('duration estimation', () => {
    it('should estimate duration correctly', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: 256,
      })

      // 256 hosts * 1 port / 256 pps = 1 second
      expect(result.durationLabel).toBe('~1s at 256 pps')
    })

    it('should show sub-second duration', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.1/32',
        portSpec: '80',
        rate: 1000,
      })

      // 1 host * 1 port / 1000 pps = <1s
      expect(result.durationLabel).toBe('~<1s at 1,000 pps')
    })

    it('should format longer durations', () => {
      const result = getScanEstimate({
        cidr: '10.0.0.0/8',
        portSpec: '1-1000',
        rate: 10000,
      })

      // Large number of probes should show hours/days
      expect(result.durationLabel).toContain('at 10,000 pps')
    })

    it('should require CIDR for duration estimate', () => {
      const result = getScanEstimate({
        cidr: '',
        portSpec: '80',
        rate: 1000,
      })

      expect(result.durationLabel).toBe('CIDR required to estimate duration')
    })

    it('should require rate for duration estimate', () => {
      const result = getScanEstimate({
        cidr: '192.168.1.0/24',
        portSpec: '80',
        rate: null,
      })

      expect(result.durationLabel).toBe('Set scan rate to estimate duration')
    })
  })
})
