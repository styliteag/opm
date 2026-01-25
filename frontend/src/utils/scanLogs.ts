import type { ScanLogEntry } from '../types'

export const parseUtcDate = (dateStr: string) =>
  new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`)

export const formatScanLogLine = (log: ScanLogEntry) => {
  const timestamp = parseUtcDate(log.timestamp).toISOString()
  return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}`
}

export const formatRawScanLogs = (logs: ScanLogEntry[]) => logs.map(formatScanLogLine).join('\n')

export const openScanLogsWindow = (logText: string, title = 'Scan Logs') => {
  if (typeof window === 'undefined') {
    return
  }

  const rawWindow = window.open('', '_blank')
  if (!rawWindow) {
    window.alert('Unable to open the raw log window. Please allow pop-ups for this site.')
    return
  }

  rawWindow.document.title = title
  rawWindow.document.body.style.margin = '0'
  rawWindow.document.body.style.backgroundColor = '#020617'
  rawWindow.document.body.style.color = '#e2e8f0'
  rawWindow.document.body.style.fontFamily = 'Menlo, Consolas, "SFMono-Regular", monospace'

  const pre = rawWindow.document.createElement('pre')
  pre.textContent = logText
  pre.style.margin = '0'
  pre.style.padding = '1rem'
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.wordBreak = 'break-word'
  pre.style.fontSize = '0.85rem'

  rawWindow.document.body.appendChild(pre)
}
