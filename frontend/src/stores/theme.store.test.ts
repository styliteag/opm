import { describe, it, expect, beforeEach } from 'vitest'

import { useThemeStore } from './theme.store'

describe('theme store', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', resolvedTheme: 'dark' })
    document.documentElement.classList.add('dark')
  })

  it('starts with dark mode', () => {
    const state = useThemeStore.getState()
    expect(state.mode).toBe('dark')
    expect(state.resolvedTheme).toBe('dark')
  })

  it('switches to light mode', () => {
    useThemeStore.getState().setMode('light')

    const state = useThemeStore.getState()
    expect(state.mode).toBe('light')
    expect(state.resolvedTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('switches back to dark mode', () => {
    useThemeStore.getState().setMode('light')
    useThemeStore.getState().setMode('dark')

    const state = useThemeStore.getState()
    expect(state.mode).toBe('dark')
    expect(state.resolvedTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
