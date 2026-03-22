import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders the label', () => {
    render(<StatusBadge label="Online" variant="success" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('renders a dot indicator when dot=true', () => {
    const { container } = render(<StatusBadge label="Online" variant="success" dot />)
    const dot = container.querySelector('.rounded-full')
    expect(dot).toBeInTheDocument()
  })

  it('does not render dot by default', () => {
    const { container } = render(<StatusBadge label="Online" variant="success" />)
    const dot = container.querySelector('.rounded-full')
    expect(dot).not.toBeInTheDocument()
  })

  it('applies success variant', () => {
    const { container } = render(<StatusBadge label="Online" variant="success" />)
    expect(container.firstChild).toHaveClass('text-emerald-400')
  })

  it('applies danger variant', () => {
    const { container } = render(<StatusBadge label="Offline" variant="danger" />)
    expect(container.firstChild).toHaveClass('text-red-400')
  })

  it('defaults to neutral variant', () => {
    const { container } = render(<StatusBadge label="Unknown" />)
    expect(container.firstChild).toHaveClass('text-slate-400')
  })
})
