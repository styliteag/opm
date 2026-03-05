import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatDateTime, parseUtcDate, formatDuration } from './formatters'

describe('formatRelativeTime', () => {
  const baseDate = new Date('2024-01-15T12:00:00Z')

  describe('seconds ago', () => {
    it('should return "Just now" for 0 seconds ago', () => {
      const value = new Date('2024-01-15T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('Just now')
    })

    it('should return "Just now" for 30 seconds ago', () => {
      const value = new Date('2024-01-15T11:59:30Z')
      expect(formatRelativeTime(value, baseDate)).toBe('Just now')
    })

    it('should return "Just now" for 59 seconds ago', () => {
      const value = new Date('2024-01-15T11:59:01Z')
      expect(formatRelativeTime(value, baseDate)).toBe('Just now')
    })
  })

  describe('minutes ago', () => {
    it('should return "1m ago" for 1 minute ago', () => {
      const value = new Date('2024-01-15T11:59:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('1m ago')
    })

    it('should return "5m ago" for 5 minutes ago', () => {
      const value = new Date('2024-01-15T11:55:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('5m ago')
    })

    it('should return "30m ago" for 30 minutes ago', () => {
      const value = new Date('2024-01-15T11:30:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('30m ago')
    })

    it('should return "59m ago" for 59 minutes ago', () => {
      const value = new Date('2024-01-15T11:01:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('59m ago')
    })
  })

  describe('hours ago', () => {
    it('should return "1h ago" for 1 hour ago', () => {
      const value = new Date('2024-01-15T11:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('1h ago')
    })

    it('should return "2h ago" for 2 hours ago', () => {
      const value = new Date('2024-01-15T10:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('2h ago')
    })

    it('should return "12h ago" for 12 hours ago', () => {
      const value = new Date('2024-01-15T00:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('12h ago')
    })

    it('should return "23h ago" for 23 hours ago', () => {
      const value = new Date('2024-01-14T13:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('23h ago')
    })
  })

  describe('days ago', () => {
    it('should return "1d ago" for 1 day ago', () => {
      const value = new Date('2024-01-14T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('1d ago')
    })

    it('should return "7d ago" for 1 week ago', () => {
      const value = new Date('2024-01-08T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('7d ago')
    })

    it('should return "30d ago" for 30 days ago', () => {
      const value = new Date('2023-12-16T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('30d ago')
    })

    it('should return "365d ago" for 1 year ago', () => {
      const value = new Date('2023-01-15T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('365d ago')
    })
  })

  describe('edge cases', () => {
    it('should return "Just now" for future dates', () => {
      const value = new Date('2024-01-15T12:01:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('Just now')
    })

    it('should work without explicit now parameter', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000)
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago')
    })

    it('should handle date at exactly 60 minutes boundary', () => {
      const value = new Date('2024-01-15T11:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('1h ago')
    })

    it('should handle date at exactly 24 hours boundary', () => {
      const value = new Date('2024-01-14T12:00:00Z')
      expect(formatRelativeTime(value, baseDate)).toBe('1d ago')
    })
  })
})

describe('formatDateTime', () => {
  it('should format date with medium date and short time', () => {
    const date = new Date('2024-01-15T14:30:45Z')
    const result = formatDateTime(date)
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/Jan|1/)
    expect(result).toMatch(/15/)
  })

  it('should handle different dates correctly', () => {
    const date1 = new Date('2024-06-01T12:00:00Z')
    const date2 = new Date('2024-06-15T15:30:00Z')
    const result1 = formatDateTime(date1)
    const result2 = formatDateTime(date2)
    expect(result1).not.toBe(result2)
    expect(result1).toMatch(/2024/)
    expect(result2).toMatch(/2024/)
  })
})

describe('parseUtcDate', () => {
  it('should parse date string without Z suffix', () => {
    const result = parseUtcDate('2024-01-15T12:00:00')
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z')
  })

  it('should parse date string with Z suffix', () => {
    const result = parseUtcDate('2024-01-15T12:00:00Z')
    expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z')
  })
})

describe('formatDuration', () => {
  it('should return dash for null startedAt', () => {
    expect(formatDuration(null, null)).toBe('—')
  })

  it('should format seconds', () => {
    expect(formatDuration('2024-01-15T12:00:00Z', '2024-01-15T12:00:45Z')).toBe('45s')
  })

  it('should format minutes and seconds', () => {
    expect(formatDuration('2024-01-15T12:00:00Z', '2024-01-15T12:05:30Z')).toBe('5m 30s')
  })

  it('should format hours and minutes', () => {
    expect(formatDuration('2024-01-15T12:00:00Z', '2024-01-15T14:15:00Z')).toBe('2h 15m')
  })

  it('should use now parameter for running scans', () => {
    const now = new Date('2024-01-15T12:02:00Z')
    expect(formatDuration('2024-01-15T12:00:00Z', null, now)).toBe('2m 0s')
  })

  it('should return dash for negative duration', () => {
    expect(formatDuration('2024-01-15T12:05:00Z', '2024-01-15T12:00:00Z')).toBe('—')
  })
})
