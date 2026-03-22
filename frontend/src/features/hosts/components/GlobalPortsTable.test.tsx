import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { GlobalPortsTable } from './GlobalPortsTable'
import type { GlobalPort } from '@/features/hosts/hooks/useGlobalPorts'

const now = new Date('2026-03-22T12:00:00Z')

const makePort = (overrides: Partial<GlobalPort> = {}): GlobalPort => ({
  ip: '10.0.0.1',
  port: 80,
  protocol: 'tcp',
  ttl: 64,
  banner: null,
  service_guess: 'http',
  mac_address: null,
  mac_vendor: null,
  first_seen_at: '2026-03-20T10:00:00Z',
  last_seen_at: '2026-03-22T11:00:00Z',
  network_id: 1,
  ...overrides,
})

describe('GlobalPortsTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders port data', () => {
    render(<GlobalPortsTable ports={[makePort()]} />)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('tcp')).toBeInTheDocument()
    expect(screen.getByText('http')).toBeInTheDocument()
  })

  it('shows dash for missing fields', () => {
    render(<GlobalPortsTable ports={[makePort({ service_guess: null, banner: null })]} />)
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(2) // service + banner
  })

  it('shows empty message when no ports', () => {
    render(<GlobalPortsTable ports={[]} />)
    expect(screen.getByText('No open ports found.')).toBeInTheDocument()
  })

  it('renders multiple ports', () => {
    render(
      <GlobalPortsTable
        ports={[
          makePort({ ip: '10.0.0.1', port: 80 }),
          makePort({ ip: '10.0.0.2', port: 443, service_guess: 'https' }),
        ]}
      />,
    )
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.2')).toBeInTheDocument()
    expect(screen.getByText('443')).toBeInTheDocument()
  })
})
