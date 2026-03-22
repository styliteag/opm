import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('renders default error message', () => {
    render(<ErrorState />)
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
  })

  it('renders custom error message', () => {
    render(<ErrorState message="Network error" />)
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders retry button when onRetry is provided', () => {
    render(<ErrorState onRetry={() => {}} />)
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorState />)
    expect(screen.queryByText('Try again')).not.toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
