import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme, type ThemePreference } from './ThemeContext'

// Test component that uses the hook
function TestComponent() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('system')}>Set System</button>
    </div>
  )
}

describe('ThemeContext', () => {
  let originalMatchMedia: typeof window.matchMedia
  let mockMatchMedia: ReturnType<typeof vi.fn>
  let mockAddEventListener: ReturnType<typeof vi.fn>
  let mockRemoveEventListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.localStorage.removeItem('opm-theme')
    document.documentElement.classList.remove('dark')

    mockAddEventListener = vi.fn()
    mockRemoveEventListener = vi.fn()

    // Mock matchMedia to return dark mode by default
    mockMatchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    originalMatchMedia = window.matchMedia
    window.matchMedia = mockMatchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.restoreAllMocks()
  })

  it('should throw error when useTheme is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useTheme must be used within ThemeProvider')

    consoleSpy.mockRestore()
  })

  it('should provide default theme as system', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme').textContent).toBe('system')
  })

  it('should resolve system theme based on matchMedia', () => {
    // matchMedia returns dark=true in beforeEach
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    expect(screen.getByTestId('resolved').textContent).toBe('dark')
  })

  it('should allow setting theme to dark', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Dark').click()
    })

    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(localStorage.getItem('opm-theme')).toBe('dark')
  })

  it('should allow setting theme to light', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Light').click()
    })

    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(localStorage.getItem('opm-theme')).toBe('light')
  })

  it('should persist theme to localStorage', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Dark').click()
    })

    expect(localStorage.getItem('opm-theme')).toBe('dark')
  })

  it('should load theme from localStorage on mount', () => {
    localStorage.setItem('opm-theme', 'light')

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('should add dark class to document when dark theme', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Dark').click()
    })

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('should remove dark class from document when light theme', async () => {
    document.documentElement.classList.add('dark')

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Light').click()
    })

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('should listen for system theme changes when set to system', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    // Should add event listener for system theme changes
    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('should cleanup event listener when switching away from system theme', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    await act(async () => {
      screen.getByText('Set Dark').click()
    })

    // Should remove event listener when not using system theme
    expect(mockRemoveEventListener).toHaveBeenCalled()
  })

  it('should handle invalid stored theme value', () => {
    localStorage.setItem('opm-theme', 'invalid-theme')

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    // Should fall back to 'system'
    expect(screen.getByTestId('theme').textContent).toBe('system')
  })

  it('should resolve to light when system prefers light mode', () => {
    // Override mock to return light mode
    mockMatchMedia.mockImplementation((query: string) => ({
      matches: false, // prefers-color-scheme: dark returns false
      media: query,
      onchange: null,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    )

    expect(screen.getByTestId('resolved').textContent).toBe('light')
  })
})
