import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlertTriangle } from 'lucide-react'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders default title and message', () => {
    render(<EmptyState />)
    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(screen.getByText('Nothing to show here yet.')).toBeInTheDocument()
  })

  it('renders custom title and message', () => {
    render(<EmptyState title="No alerts" message="Everything looks good." />)
    expect(screen.getByText('No alerts')).toBeInTheDocument()
    expect(screen.getByText('Everything looks good.')).toBeInTheDocument()
  })

  it('renders an action button when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Add item</button>}
      />,
    )
    expect(screen.getByText('Add item')).toBeInTheDocument()
  })
})
