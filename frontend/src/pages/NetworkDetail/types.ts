import type { ScannerType, ScanProtocol, SSHAlertConfig } from '../../types'

export type NetworkResponse = {
  id: number
  name: string
  cidr: string
  port_spec: string
  scanner_id: number
  scan_schedule: string | null
  scan_rate: number | null
  scan_timeout: number | null
  port_timeout: number | null
  scanner_type: ScannerType
  scan_protocol: ScanProtocol
  is_ipv6: boolean
  host_discovery_enabled: boolean
  alert_config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type EditFormValues = {
  name: string
  cidr: string
  portSpec: string
  scannerId: string
  schedule: string
  scanRate: string
  scanTimeoutMinutes: string
  portTimeout: string
  scannerType: ScannerType
  scanProtocol: ScanProtocol
  hostDiscoveryEnabled: boolean
}

export type RuleFormValues = {
  port: string
  ruleType: 'allow' | 'block'
  description: string
}

export { SSHAlertConfig }
