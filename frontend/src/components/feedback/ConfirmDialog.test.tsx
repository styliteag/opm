import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete item?"
        description="This action cannot be undone."
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('Delete item?')).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Delete item?"
        description="This action cannot be undone."
        onConfirm={() => {}}
      />,
    )
    expect(screen.queryByText('Delete item?')).not.toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete?"
        description="Are you sure?"
        confirmLabel="Yes, delete"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('Yes, delete'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm?"
        description="Please confirm"
        confirmLabel="Do it"
        cancelLabel="Nope"
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('Do it')).toBeInTheDocument()
    expect(screen.getByText('Nope')).toBeInTheDocument()
  })
})
