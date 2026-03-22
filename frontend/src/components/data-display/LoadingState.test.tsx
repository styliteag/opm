import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('renders 5 skeleton rows by default', () => {
    const { container } = render(<LoadingState />)
    const rows = container.querySelectorAll('.animate-pulse')
    expect(rows.length).toBe(5)
  })

  it('renders custom number of rows', () => {
    const { container } = render(<LoadingState rows={3} />)
    const rows = container.querySelectorAll('.animate-pulse')
    expect(rows.length).toBe(3)
  })

  it('applies decreasing opacity to rows', () => {
    const { container } = render(<LoadingState rows={3} />)
    const rows = container.querySelectorAll('.animate-pulse')
    const firstStyle = rows[0].getAttribute('style') ?? ''
    const lastStyle = rows[2].getAttribute('style') ?? ''
    // First row has higher opacity than last row
    const firstOpacity = parseFloat(firstStyle.match(/opacity:\s*([\d.]+)/)?.[1] ?? '1')
    const lastOpacity = parseFloat(lastStyle.match(/opacity:\s*([\d.]+)/)?.[1] ?? '0')
    expect(firstOpacity).toBeGreaterThan(lastOpacity)
  })
})
