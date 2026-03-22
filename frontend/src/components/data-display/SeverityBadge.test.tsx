import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SeverityBadge } from './SeverityBadge'

describe('SeverityBadge', () => {
  it('renders the severity label', () => {
    render(<SeverityBadge severity="critical" />)
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('applies critical styling', () => {
    const { container } = render(<SeverityBadge severity="critical" />)
    expect(container.firstChild).toHaveClass('text-red-400')
  })

  it('applies high styling', () => {
    const { container } = render(<SeverityBadge severity="high" />)
    expect(container.firstChild).toHaveClass('text-orange-400')
  })

  it('applies medium styling', () => {
    const { container } = render(<SeverityBadge severity="medium" />)
    expect(container.firstChild).toHaveClass('text-yellow-400')
  })

  it('applies info styling', () => {
    const { container } = render(<SeverityBadge severity="info" />)
    expect(container.firstChild).toHaveClass('text-blue-400')
  })

  it('accepts custom className', () => {
    const { container } = render(<SeverityBadge severity="critical" className="ml-2" />)
    expect(container.firstChild).toHaveClass('ml-2')
  })
})
