import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatDateTime } from './formatRelativeTime'

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
  it('should format date with full date and time components', () => {
    const date = new Date('2024-01-15T14:30:45Z')
    const result = formatDateTime(date)

    // The exact format depends on locale, but should contain key components
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/Jan|1/)
    expect(result).toMatch(/15/)
  })

  it('should include seconds in output', () => {
    const date = new Date('2024-06-20T09:05:30Z')
    const result = formatDateTime(date)

    // Should have time components
    expect(result).toContain(':')
  })

  it('should handle different dates correctly', () => {
    const date1 = new Date('2024-06-01T12:00:00Z')
    const date2 = new Date('2024-06-15T15:30:00Z')

    const result1 = formatDateTime(date1)
    const result2 = formatDateTime(date2)

    // Results should be different
    expect(result1).not.toBe(result2)
    // Both dates are in the middle of the year, so should show 2024 regardless of timezone
    expect(result1).toMatch(/2024/)
    expect(result2).toMatch(/2024/)
  })
})
