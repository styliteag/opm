import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ApiKeyDisplay } from './ApiKeyDisplay'

describe('ApiKeyDisplay', () => {
  it('renders the API key', () => {
    render(<ApiKeyDisplay apiKey="abc123secret" onDismiss={() => {}} />)
    expect(screen.getByText('abc123secret')).toBeInTheDocument()
  })

  it('shows copy button', () => {
    render(<ApiKeyDisplay apiKey="key123" onDismiss={() => {}} />)
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('shows warning message', () => {
    render(<ApiKeyDisplay apiKey="key123" onDismiss={() => {}} />)
    expect(screen.getByText(/copy now/i)).toBeInTheDocument()
  })

  it('calls onDismiss when X is clicked', () => {
    const onDismiss = vi.fn()
    render(<ApiKeyDisplay apiKey="key123" onDismiss={onDismiss} />)

    // Find the dismiss button (X icon)
    const buttons = screen.getAllByRole('button')
    const dismissBtn = buttons.find((b) => b.title === '' || b.getAttribute('class')?.includes('ghost'))
    if (dismissBtn) fireEvent.click(dismissBtn)

    expect(onDismiss).toHaveBeenCalled()
  })

  it('copies to clipboard on Copy click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<ApiKeyDisplay apiKey="secret-key-value" onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('Copy'))

    expect(writeText).toHaveBeenCalledWith('secret-key-value')
  })
})
