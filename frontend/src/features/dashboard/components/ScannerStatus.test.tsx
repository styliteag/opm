import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ScannerStatus } from './ScannerStatus'
import type { Scanner } from '@/lib/types'

const now = new Date('2026-03-22T12:00:00Z')

const makeScanner = (overrides: Partial<Scanner> = {}): Scanner => ({
  id: 1,
  name: 'Test Scanner',
  description: null,
  last_seen_at: null,
  scanner_version: null,
  ...overrides,
})

describe('ScannerStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "No scanners registered" when empty', () => {
    render(<ScannerStatus scanners={[]} />)
    expect(screen.getByText('No scanners registered')).toBeInTheDocument()
  })

  it('renders scanner names', () => {
    render(
      <ScannerStatus scanners={[makeScanner({ name: 'HQ Berlin' })]} />,
    )
    expect(screen.getByText('HQ Berlin')).toBeInTheDocument()
  })

  it('shows online count', () => {
    const scanners = [
      makeScanner({ id: 1, name: 'A', last_seen_at: '2026-03-22T11:58:00Z' }),
      makeScanner({ id: 2, name: 'B', last_seen_at: '2026-03-22T10:00:00Z' }),
    ]
    render(<ScannerStatus scanners={scanners} />)
    expect(screen.getByText('1/2 online')).toBeInTheDocument()
  })

  it('marks scanner as online if seen within 5 minutes', () => {
    render(
      <ScannerStatus
        scanners={[makeScanner({ last_seen_at: '2026-03-22T11:57:00Z' })]}
      />,
    )
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('marks scanner as offline if not seen within 5 minutes', () => {
    render(
      <ScannerStatus
        scanners={[makeScanner({ last_seen_at: '2026-03-22T11:50:00Z' })]}
      />,
    )
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows "Never seen" for scanner with no last_seen_at', () => {
    render(
      <ScannerStatus scanners={[makeScanner({ last_seen_at: null })]} />,
    )
    expect(screen.getByText('Never seen')).toBeInTheDocument()
  })
})
