import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseUtcDate, formatScanLogLine, formatRawScanLogs, openScanLogsWindow } from './scanLogs'
import type { ScanLogEntry } from '../types'

describe('parseUtcDate', () => {
  it('should parse date string with Z suffix', () => {
    const result = parseUtcDate('2024-01-15T10:30:00Z')
    expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z')
  })

  it('should parse date string without Z suffix and add it', () => {
    const result = parseUtcDate('2024-01-15T10:30:00')
    expect(result.toISOString()).toBe('2024-01-15T10:30:00.000Z')
  })

  it('should handle date with milliseconds', () => {
    const result = parseUtcDate('2024-01-15T10:30:00.123Z')
    expect(result.toISOString()).toBe('2024-01-15T10:30:00.123Z')
  })

  it('should handle date with milliseconds without Z suffix', () => {
    const result = parseUtcDate('2024-01-15T10:30:00.456')
    expect(result.toISOString()).toBe('2024-01-15T10:30:00.456Z')
  })
})

describe('formatScanLogLine', () => {
  it('should format log entry with timestamp, level, and message', () => {
    const log: ScanLogEntry = {
      timestamp: '2024-01-15T10:30:00Z',
      level: 'info',
      message: 'Scan started',
    }

    const result = formatScanLogLine(log)
    expect(result).toBe('[2024-01-15T10:30:00.000Z] [INFO] Scan started')
  })

  it('should uppercase the log level', () => {
    const log: ScanLogEntry = {
      timestamp: '2024-01-15T10:30:00Z',
      level: 'error',
      message: 'Connection failed',
    }

    const result = formatScanLogLine(log)
    expect(result).toContain('[ERROR]')
  })

  it('should handle warning level', () => {
    const log: ScanLogEntry = {
      timestamp: '2024-01-15T10:30:00Z',
      level: 'warning',
      message: 'Rate limited',
    }

    const result = formatScanLogLine(log)
    expect(result).toContain('[WARNING]')
  })

  it('should handle debug level', () => {
    const log: ScanLogEntry = {
      timestamp: '2024-01-15T10:30:00Z',
      level: 'debug',
      message: 'Packet sent',
    }

    const result = formatScanLogLine(log)
    expect(result).toContain('[DEBUG]')
  })

  it('should handle timestamp without Z suffix', () => {
    const log: ScanLogEntry = {
      timestamp: '2024-01-15T10:30:00',
      level: 'info',
      message: 'Test message',
    }

    const result = formatScanLogLine(log)
    expect(result).toBe('[2024-01-15T10:30:00.000Z] [INFO] Test message')
  })
})

describe('formatRawScanLogs', () => {
  it('should format multiple log entries joined by newlines', () => {
    const logs: ScanLogEntry[] = [
      { timestamp: '2024-01-15T10:30:00Z', level: 'info', message: 'Starting scan' },
      { timestamp: '2024-01-15T10:30:01Z', level: 'info', message: 'Scanning hosts' },
      { timestamp: '2024-01-15T10:30:05Z', level: 'info', message: 'Scan complete' },
    ]

    const result = formatRawScanLogs(logs)
    const lines = result.split('\n')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Starting scan')
    expect(lines[1]).toContain('Scanning hosts')
    expect(lines[2]).toContain('Scan complete')
  })

  it('should return empty string for empty array', () => {
    const result = formatRawScanLogs([])
    expect(result).toBe('')
  })

  it('should handle single log entry', () => {
    const logs: ScanLogEntry[] = [
      { timestamp: '2024-01-15T10:30:00Z', level: 'error', message: 'Failed' },
    ]

    const result = formatRawScanLogs(logs)
    expect(result).toBe('[2024-01-15T10:30:00.000Z] [ERROR] Failed')
    expect(result.split('\n')).toHaveLength(1)
  })
})

describe('openScanLogsWindow', () => {
  const originalWindow = global.window
  let mockWindowOpen: ReturnType<typeof vi.fn>
  let mockDocument: {
    title: string
    body: {
      style: Record<string, string>
      appendChild: ReturnType<typeof vi.fn>
    }
    createElement: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    mockDocument = {
      title: '',
      body: {
        style: {},
        appendChild: vi.fn(),
      },
      createElement: vi.fn(() => ({
        textContent: '',
        style: {},
      })),
    }

    mockWindowOpen = vi.fn(() => ({
      document: mockDocument,
    }))

    global.window = {
      ...originalWindow,
      open: mockWindowOpen,
      alert: vi.fn(),
    } as unknown as Window & typeof globalThis
  })

  afterEach(() => {
    global.window = originalWindow
    vi.restoreAllMocks()
  })

  it('should open a new window with log content', () => {
    openScanLogsWindow('Test log content', 'My Logs')

    expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank')
    expect(mockDocument.title).toBe('My Logs')
    expect(mockDocument.body.appendChild).toHaveBeenCalled()
  })

  it('should use default title when not provided', () => {
    openScanLogsWindow('Test log content')

    expect(mockDocument.title).toBe('Scan Logs')
  })

  it('should set dark background styling', () => {
    openScanLogsWindow('Test log content')

    expect(mockDocument.body.style.backgroundColor).toBe('#020617')
    expect(mockDocument.body.style.color).toBe('#e2e8f0')
    expect(mockDocument.body.style.margin).toBe('0')
  })

  it('should create pre element with log content', () => {
    openScanLogsWindow('Line 1\nLine 2')

    expect(mockDocument.createElement).toHaveBeenCalledWith('pre')
  })

  it('should show alert when popup is blocked', () => {
    mockWindowOpen.mockReturnValue(null)

    openScanLogsWindow('Test content')

    expect(window.alert).toHaveBeenCalledWith(
      'Unable to open the raw log window. Please allow pop-ups for this site.'
    )
  })
})
