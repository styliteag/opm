import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ScanActivityCard } from './ScanActivityCard'
import type { LatestScanEntry } from '@/lib/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
    <a {...props}>{children}</a>
  ),
}))

describe('ScanActivityCard', () => {
  it('shows "No recent scans" when empty', () => {
    render(<ScanActivityCard latestScans={[]} />)
    expect(screen.getByText('No recent scans')).toBeInTheDocument()
  })

  it('shows "No recent scans" when all scans are null', () => {
    const entries: LatestScanEntry[] = [
      { network_id: 1, scan: null },
      { network_id: 2, scan: null },
    ]
    render(<ScanActivityCard latestScans={entries} />)
    expect(screen.getByText('No recent scans')).toBeInTheDocument()
  })

  it('renders scan entries with port count', () => {
    const entries: LatestScanEntry[] = [
      {
        network_id: 1,
        scan: {
          id: 10,
          network_id: 1,
          scanner_id: 1,
          status: 'completed',
          started_at: '2026-03-22T10:00:00Z',
          completed_at: '2026-03-22T10:05:00Z',
          cancelled_at: null,
          cancelled_by: null,
          cancelled_by_email: null,
          error_message: null,
          trigger_type: 'scheduled',
          hidden: false,
          progress_percent: null,
          progress_message: null,
          port_count: 42,
        },
      },
    ]
    render(<ScanActivityCard latestScans={entries} />)
    expect(screen.getByText(/42 ports/)).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders "View all" link', () => {
    render(<ScanActivityCard latestScans={[]} />)
    expect(screen.getByText('View all')).toBeInTheDocument()
  })
})
