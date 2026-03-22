import { describe, it, expect, beforeEach } from 'vitest'

import { useUiStore } from './ui.store'

describe('ui store', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarCollapsed: false,
      quickScanModalOpen: false,
    })
  })

  it('starts with sidebar expanded', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('toggles sidebar', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)

    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('opens and closes quick scan modal', () => {
    useUiStore.getState().openQuickScan()
    expect(useUiStore.getState().quickScanModalOpen).toBe(true)

    useUiStore.getState().closeQuickScan()
    expect(useUiStore.getState().quickScanModalOpen).toBe(false)
  })
})
