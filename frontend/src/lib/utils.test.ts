import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { cn, formatDate, formatRelativeTime, parseUTC } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('resolves tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('merges complex tailwind classes', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})

describe('parseUTC', () => {
  it('appends Z to timestamps without timezone info', () => {
    const result = parseUTC('2026-03-22T17:46:20')
    expect(result.toISOString()).toBe('2026-03-22T17:46:20.000Z')
  })

  it('does not double-append Z to timestamps that already have it', () => {
    const result = parseUTC('2026-03-22T17:46:20Z')
    expect(result.toISOString()).toBe('2026-03-22T17:46:20.000Z')
  })

  it('preserves timestamps with explicit offset', () => {
    const result = parseUTC('2026-03-22T18:46:20+01:00')
    expect(result.toISOString()).toBe('2026-03-22T17:46:20.000Z')
  })

  it('returns Date objects unchanged', () => {
    const date = new Date('2026-03-22T17:46:20Z')
    expect(parseUTC(date)).toBe(date)
  })

  it('treats bare timestamps as UTC, not local time', () => {
    // This is the core bug: "2026-03-22T17:46:20" without Z
    // was parsed as local time, causing a timezone offset.
    // In Europe/Berlin (UTC+1), this would be off by 1 hour.
    const withoutZ = parseUTC('2026-03-22T17:46:20')
    const withZ = parseUTC('2026-03-22T17:46:20Z')
    expect(withoutZ.getTime()).toBe(withZ.getTime())
  })
})

describe('formatDate', () => {
  it('formats a date string', () => {
    const result = formatDate('2026-03-15T14:30:00Z')
    expect(result).toContain('Mar')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })

  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-01-01T00:00:00Z'))
    expect(result).toContain('2026')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for recent times', () => {
    expect(formatRelativeTime('2026-03-22T11:59:30Z')).toBe('just now')
  })

  it('returns minutes ago', () => {
    expect(formatRelativeTime('2026-03-22T11:55:00Z')).toBe('5m ago')
  })

  it('returns hours ago', () => {
    expect(formatRelativeTime('2026-03-22T09:00:00Z')).toBe('3h ago')
  })

  it('returns days ago', () => {
    expect(formatRelativeTime('2026-03-20T12:00:00Z')).toBe('2d ago')
  })

  it('returns formatted date for older dates', () => {
    const result = formatRelativeTime('2026-02-01T12:00:00Z')
    expect(result).toContain('Feb')
    expect(result).toContain('1')
    expect(result).toContain('2026')
  })

  it('handles string input', () => {
    const result = formatRelativeTime('2026-03-22T11:50:00Z')
    expect(result).toBe('10m ago')
  })

  it('handles Date input', () => {
    const result = formatRelativeTime(new Date('2026-03-22T11:50:00Z'))
    expect(result).toBe('10m ago')
  })
})
