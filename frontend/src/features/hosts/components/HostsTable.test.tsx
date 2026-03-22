import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { HostsTable } from './HostsTable'
import type { Host } from '@/lib/types'

// Mock TanStack Router's Link
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: { children: React.ReactNode; to: string; params?: Record<string, string>; className?: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const now = new Date('2026-03-22T12:00:00Z')

const makeHost = (overrides: Partial<Host> = {}): Host => ({
  id: 1,
  ip: '192.168.1.1',
  hostname: null,
  is_pingable: null,
  mac_address: null,
  mac_vendor: null,
  first_seen_at: '2026-03-20T10:00:00Z',
  last_seen_at: '2026-03-22T11:00:00Z',
  user_comment: null,
  seen_by_networks: [1],
  open_port_count: 5,
  ...overrides,
})

describe('HostsTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders host IP as link', () => {
    render(<HostsTable hosts={[makeHost()]} />)
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
  })

  it('renders hostname when available', () => {
    render(<HostsTable hosts={[makeHost({ hostname: 'web-server-01' })]} />)
    expect(screen.getByText('web-server-01')).toBeInTheDocument()
  })

  it('shows dash for missing hostname', () => {
    render(<HostsTable hosts={[makeHost({ hostname: null })]} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('renders open port count', () => {
    render(<HostsTable hosts={[makeHost({ open_port_count: 12 })]} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders multiple hosts', () => {
    const hosts = [
      makeHost({ id: 1, ip: '10.0.0.1' }),
      makeHost({ id: 2, ip: '10.0.0.2' }),
      makeHost({ id: 3, ip: '10.0.0.3' }),
    ]
    render(<HostsTable hosts={hosts} />)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.2')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.3')).toBeInTheDocument()
  })

  it('shows Online status for recently seen hosts', () => {
    render(<HostsTable hosts={[makeHost({ last_seen_at: '2026-03-22T11:30:00Z' })]} />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('shows Offline status for old hosts', () => {
    render(<HostsTable hosts={[makeHost({ last_seen_at: '2026-03-19T10:00:00Z' })]} />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })
})
