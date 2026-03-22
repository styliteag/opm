// Manual types until OpenAPI codegen is set up with a running backend.
// These mirror the backend Pydantic schemas exactly.

export type AlertType =
  | 'new_port'
  | 'not_allowed'
  | 'blocked'
  | 'ssh_insecure_auth'
  | 'ssh_weak_cipher'
  | 'ssh_weak_kex'
  | 'ssh_outdated_version'
  | 'ssh_config_regression'
  | 'nse_vulnerability'
  | 'nse_cve_detected'

export type Severity = 'critical' | 'high' | 'medium' | 'info'
export type ResolutionStatus = 'open' | 'in_progress' | 'resolved' | 'fix_planned'
export type ScanStatus = 'planned' | 'running' | 'completed' | 'error' | 'cancelled'
export type TriggerType = 'manual' | 'scheduled'
export type RuleType = 'accepted' | 'critical'

export interface PortRuleMatch {
  id: number
  scope: 'global' | 'network'
  network_id: number | null
  network_name: string | null
  rule_type: RuleType
  description: string | null
  ip: string | null
}

export interface AlertSSHSummary {
  ssh_version: string | null
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  has_weak_ciphers: boolean
  has_weak_kex: boolean
  last_scanned: string
}

export interface Alert {
  id: number
  type: AlertType
  source: string
  network_id: number | null
  network_name: string | null
  global_open_port_id: number | null
  ip: string
  port: number | null
  message: string
  dismissed: boolean
  assigned_to_user_id: number | null
  assigned_to_email: string | null
  resolution_status: ResolutionStatus
  created_at: string
  dismiss_reason: string | null
  severity: Severity
  severity_override: Severity | null
  host_id: number | null
  hostname: string | null
  user_comment: string | null
  last_comment: string | null
  last_comment_by: string | null
  last_comment_at: string | null
  ssh_summary: AlertSSHSummary | null
  related_ssh_alert_count: number
  related_ssh_alerts_dismissed: boolean
  matching_rules: PortRuleMatch[]
}

export interface AlertListResponse {
  alerts: Alert[]
}

export interface DismissSuggestion {
  reason: string
  frequency: number
  last_used: string | null
  same_port: boolean
}

export interface AlertComment {
  id: number
  alert_id: number
  user_id: number
  user_email: string
  content: string
  created_at: string
  updated_at: string | null
}

export interface Network {
  id: number
  name: string
  cidr: string
  port_spec: string
  scanner_id: number
  scan_schedule: string | null
  scan_rate: number | null
  scan_timeout: number | null
  port_timeout: number | null
  scanner_type: string
  scan_protocol: string
  alert_config: Record<string, unknown> | null
  nse_profile_id: number | null
  host_discovery_enabled: boolean
  scan_schedule_enabled: boolean
  is_ipv6: boolean
  created_at: string
  updated_at: string
}

export interface NetworkListResponse {
  networks: Network[]
}

export interface ScanSummary {
  id: number
  network_id: number
  scanner_id: number
  status: ScanStatus
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancelled_by: number | null
  cancelled_by_email: string | null
  error_message: string | null
  trigger_type: TriggerType
  hidden: boolean
  progress_percent: number | null
  progress_message: string | null
  actual_rate: number | null
  port_count: number
}

export interface LatestScanEntry {
  network_id: number
  scan: ScanSummary | null
}

export interface LatestScansByNetworkResponse {
  latest_scans: LatestScanEntry[]
}

export interface Scanner {
  id: number
  name: string
  description: string | null
  last_seen_at: string | null
  scanner_version: string | null
  created_at?: string
}

export interface ScannerListResponse {
  scanners: Scanner[]
}

export interface Host {
  id: number
  ip: string
  hostname: string | null
  is_pingable: boolean | null
  mac_address: string | null
  mac_vendor: string | null
  first_seen_at: string
  last_seen_at: string
  user_comment: string | null
  seen_by_networks: number[]
  open_port_count: number | null
}

export interface HostListResponse {
  hosts: Host[]
  total_count: number
  pingable_count: number
}

export interface HostOpenPort {
  id: number
  ip: string
  port: number
  protocol: string
  banner: string | null
  service_guess: string | null
  user_comment: string | null
  first_seen_at: string
  last_seen_at: string
  is_stale: boolean
}

export interface EnrichedHostPort extends HostOpenPort {
  alert_id: number | null
  alert_status: 'new' | 'dismissed' | null
  alert_severity: string | null
  dismiss_reason: string | null
  rule_status: RuleType | null
  matching_rules: PortRuleMatch[]
  ssh_summary: AlertSSHSummary | null
  is_stale: boolean
}

export interface HostAlertSummary {
  id: number
  type: string
  port: number
  message: string
  severity: string
  dismissed: boolean
  resolution_status: string
  created_at: string
  dismiss_reason: string | null
  network_id: number | null
  network_name: string | null
  ssh_summary: AlertSSHSummary | null
  related_ssh_alert_count: number
  related_ssh_alerts_dismissed: boolean
}

export interface HostScanEntry {
  id: number
  network_id: number
  network_name: string | null
  status: string
  started_at: string | null
  completed_at: string | null
  trigger_type: string
  port_count: number
}

export interface HostOverviewResponse {
  host: Host
  ports: EnrichedHostPort[]
  networks: { id: number; name: string; cidr: string }[]
  alerts: HostAlertSummary[]
  dismissed_alerts: HostAlertSummary[]
  dismissed_alert_count: number
  ssh: AlertSSHSummary | null
  recent_scans: HostScanEntry[]
  matching_rules: PortRuleMatch[]
}

export interface TrendDataPoint {
  date: string
  count: number
}

export interface AlertTrendDataPoint extends TrendDataPoint {
  dismissed_count: number
}

export interface TrendDataResponse {
  data: TrendDataPoint[]
}

export interface AlertTrendDataResponse {
  data: AlertTrendDataPoint[]
}

export interface NseResult {
  id: number
  scan_id: number
  ip: string
  port: number
  protocol: string
  script_name: string
  script_output: string
  cve_ids: string[]
  severity: Severity
  template_id: number | null
  created_at: string
}

export interface NseResultListResponse {
  results: NseResult[]
  total: number
}
