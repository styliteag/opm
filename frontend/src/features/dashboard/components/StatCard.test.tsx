import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShieldAlert } from 'lucide-react'

import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Active Alerts" value={42} icon={ShieldAlert} />)
    expect(screen.getByText('Active Alerts')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders string values', () => {
    render(<StatCard label="Status" value="Online" icon={ShieldAlert} />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('renders trend when provided', () => {
    render(<StatCard label="Alerts" value={10} icon={ShieldAlert} trend="5 new today" />)
    expect(screen.getByText('5 new today')).toBeInTheDocument()
  })

  it('does not render trend when not provided', () => {
    render(<StatCard label="Alerts" value={10} icon={ShieldAlert} />)
    const trendElements = screen.queryByText('new')
    expect(trendElements).not.toBeInTheDocument()
  })
})
