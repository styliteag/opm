import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { AlertFilters } from './AlertFilters'

const networks = [
  { id: 1, name: 'Internal LAN' },
  { id: 2, name: 'Public DMZ' },
]

describe('AlertFilters', () => {
  it('renders all filter dropdowns', () => {
    render(
      <AlertFilters filters={{}} onChange={() => {}} networks={networks} />,
    )
    expect(screen.getByText('Filter By:')).toBeInTheDocument()
    // Check that selects exist via their default options
    expect(screen.getByText('Severity: All')).toBeInTheDocument()
    expect(screen.getByText('Type: All')).toBeInTheDocument()
    expect(screen.getByText('Network: All')).toBeInTheDocument()
    expect(screen.getByText('Status: All')).toBeInTheDocument()
  })

  it('renders network options', () => {
    render(
      <AlertFilters filters={{}} onChange={() => {}} networks={networks} />,
    )
    expect(screen.getByText('Internal LAN')).toBeInTheDocument()
    expect(screen.getByText('Public DMZ')).toBeInTheDocument()
  })

  it('calls onChange when severity is selected', () => {
    const onChange = vi.fn()
    render(
      <AlertFilters filters={{}} onChange={onChange} networks={networks} />,
    )

    const severitySelect = screen.getByDisplayValue('Severity: All')
    fireEvent.change(severitySelect, { target: { value: 'critical' } })

    expect(onChange).toHaveBeenCalledWith({ severity: 'critical' })
  })

  it('calls onChange with undefined when "All" is selected', () => {
    const onChange = vi.fn()
    render(
      <AlertFilters
        filters={{ severity: 'critical' }}
        onChange={onChange}
        networks={networks}
      />,
    )

    const severitySelect = screen.getByDisplayValue('Critical')
    fireEvent.change(severitySelect, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith({ severity: undefined })
  })
})
