// Alert types
export type AlertType =
  | 'new_port'
  | 'not_allowed'
  | 'blocked'
  | 'ssh_insecure_auth'
  | 'ssh_weak_cipher'
  | 'ssh_weak_kex'
  | 'ssh_outdated_version'
  | 'ssh_config_regression'
  | (string & {})

// SSH Alert Configuration
export type SSHAlertConfig = {
  // Port-based alerts
  new_port?: boolean
  not_allowed?: boolean
  blocked?: boolean
  // SSH security alerts
  ssh_insecure_auth?: boolean
  ssh_weak_cipher?: boolean
  ssh_weak_kex?: boolean
  ssh_outdated_version?: boolean
  ssh_config_regression?: boolean
  // SSH version threshold
  ssh_version_threshold?: string
}
export type Severity = 'critical' | 'high' | 'medium' | 'info'
export type ResolutionStatus = 'open' | 'in_progress' | 'resolved' | 'fix_planned'

export type AlertSSHSummary = {
  ssh_version: string | null
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  has_weak_ciphers: boolean
  has_weak_kex: boolean
  last_scanned: string
}

export type Alert = {
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
  severity: Severity
  severity_override: Severity | null
  // Host information (if available)
  host_id: number | null
  hostname: string | null
  user_comment: string | null
  dismiss_reason: string | null
  last_comment: string | null
  last_comment_by: string | null
  last_comment_at: string | null
  // SSH context (for alerts on SSH ports)
  ssh_summary: AlertSSHSummary | null
  related_ssh_alert_count: number
  related_ssh_alerts_dismissed: boolean
  // Port rule context
  matching_rules: PortRuleMatch[]
}

export type AlertListResponse = {
  alerts: Alert[]
}

// Network types
export type ScannerType = 'masscan' | 'nmap' | (string & {})
export type ScanProtocol = 'tcp' | 'udp' | 'both'

export type Network = {
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
  alert_config?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type NetworkListResponse = {
  networks: Network[]
}

export type CreateNetworkPayload = {
  name: string
  cidr: string
  port_spec: string
  scanner_id: number
  scan_schedule: string | null
  scan_rate?: number | null
  scan_timeout?: number | null
  port_timeout?: number | null
  scanner_type?: ScannerType
  scan_protocol?: ScanProtocol
}

export type UpdateNetworkPayload = {
  name: string
  cidr: string
  port_spec: string
  scanner_id: number
  scan_schedule: string | null
  scan_rate?: number | null
  scan_timeout?: number | null
  port_timeout?: number | null
  scanner_type?: ScannerType
  scan_protocol?: ScanProtocol
  host_discovery_enabled?: boolean
  alert_config?: SSHAlertConfig | null
}

// Scanner types
export type Scanner = {
  id: number
  name: string
  description: string | null
  last_seen_at: string | null
  scanner_version: string | null
  created_at?: string
}

export type ScannerListResponse = {
  scanners: Scanner[]
}

export type ScannerCreateResponse = {
  id: number
  name: string
  description: string | null
  last_seen_at: string | null
  created_at: string
  api_key: string
}

export type ScannerRegenerateKeyResponse = {
  id: number
  name: string
  api_key: string
}

// Scan types
export type ScanSummary = {
  id: number
  network_id: number
  network_name?: string
  scanner_id: number
  scanner_name?: string
  status: string
  started_at: string | null
  completed_at: string | null
  cancelled_at?: string | null
  cancelled_by?: number | null
  cancelled_by_email?: string | null
  error_message: string | null
  trigger_type: string
  port_count: number
  progress_percent: number | null
  progress_message: string | null
  hidden: boolean
}

export type ScanListResponse = {
  scans: ScanSummary[]
}

export type ScansListResponse = {
  scans: ScanSummary[]
}

export type LatestScanByNetwork = {
  network_id: number
  scan: ScanSummary | null
}

export type LatestScansByNetworkResponse = {
  latest_scans: LatestScanByNetwork[]
}

export type ScanDetail = {
  id: number
  network_id: number
  scanner_id: number
  status: string
  started_at: string | null
  completed_at: string | null
  cancelled_at?: string | null
  cancelled_by?: number | null
  cancelled_by_email?: string | null
  error_message: string | null
  trigger_type: string
  hidden: boolean
  progress_percent: number | null
  progress_message: string | null
  open_ports: OpenPort[]
}

export type ScanDiff = {
  scan_id: number
  compare_to_id: number
  added_ports: OpenPort[]
  removed_ports: OpenPort[]
  unchanged_ports: OpenPort[]
}

export type ScanLogEntry = {
  timestamp: string
  level: string
  message: string
}

export type ScanLogsResponse = {
  logs: ScanLogEntry[]
}

// Open port types
export type OpenPort = {
  ip: string
  port: number
  protocol: string
  ttl: number | null
  banner: string | null
  service_guess: string | null
  mac_address: string | null
  mac_vendor: string | null
  first_seen_at: string
  last_seen_at: string
  network_id: number
}

// Port rule types
export type PortRule = {
  id: number
  network_id: number
  ip: string | null
  port: string
  rule_type: 'accepted' | 'critical'
  description: string | null
}

export type PortRuleListResponse = {
  rules: PortRule[]
}

export type PortRuleCreatePayload = {
  ip?: string | null
  port: string
  rule_type: 'accepted' | 'critical'
  description?: string | null
}

// User types
export type UserRole = 'admin' | 'viewer'

export type User = {
  id: number
  email: string
  role: UserRole
  theme_preference: 'light' | 'dark' | 'system'
  created_at: string
  updated_at: string
}

export type UserListResponse = {
  users: User[]
}

// Global Open Port types
export type GlobalOpenPort = {
  id: number
  ip: string
  port: number
  protocol: string
  banner: string | null
  service_guess: string | null
  mac_address: string | null
  mac_vendor: string | null
  first_seen_at: string
  last_seen_at: string
  seen_by_networks: number[]
  user_comment: string | null
}

export type GlobalOpenPortListResponse = {
  ports: GlobalOpenPort[]
}

// Port rule (unified) types
export type PortRuleUnified = {
  id: number
  network_id: number | null
  network_name: string | null
  ip: string | null
  port: string
  rule_type: 'accepted' | 'critical'
  description: string | null
  source?: string
  created_at?: string | null
  created_by?: number | null
}

export type PortRuleUnifiedListResponse = {
  rules: PortRuleUnified[]
}

export type PortRuleUnifiedCreatePayload = {
  network_id?: number | null
  ip?: string | null
  port: string
  rule_type: 'accepted' | 'critical'
  description?: string | null
  source?: string
}

// Host types
export type Host = {
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
  open_port_count?: number
}

export type HostListResponse = {
  hosts: Host[]
  total_count: number
  pingable_count: number
}

export type BulkDeleteHostsResponse = {
  deleted_ids: number[]
  deleted_count: number
}

export type HostOpenPort = {
  id: number
  ip: string
  port: number
  protocol: string
  banner: string | null
  service_guess: string | null
  user_comment: string | null
  first_seen_at: string
  last_seen_at: string
}

export type PortRuleMatch = {
  id: number
  scope: 'global' | 'network'
  network_id: number | null
  network_name: string | null
  rule_type: 'accepted' | 'critical'
  description: string | null
  ip: string | null
}

export type EnrichedHostPort = HostOpenPort & {
  alert_id: number | null
  alert_status: 'new' | 'dismissed' | null
  alert_severity: string | null
  dismiss_reason: string | null
  rule_status: 'accepted' | 'critical' | null
  matching_rules: PortRuleMatch[]
  ssh_summary: HostSSHSummary | null
}

export type HostOpenPortListResponse = {
  ports: HostOpenPort[]
}

export type HostDiscoveryScan = {
  id: number
  network_id: number
  scanner_id: number
  status: string
  trigger_type: string
  started_at: string | null
  completed_at: string | null
  hosts_discovered: number
  error_message: string | null
}

export type HostDiscoveryScanListResponse = {
  scans: HostDiscoveryScan[]
}

export type TriggerHostDiscoveryResponse = {
  scan_id: number
  message: string
}

// Alert Comment types
export type AlertComment = {
  id: number
  alert_id: number
  user_id: number
  user_email: string
  comment: string
  created_at: string
  updated_at: string
}

export type AlertCommentListResponse = {
  comments: AlertComment[]
}

// Host Overview types
export type HostNetworkInfo = {
  id: number
  name: string
  cidr: string
}

export type HostAlertSummary = {
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
  // SSH context (for alerts on SSH ports)
  ssh_summary: HostSSHSummary | null
  related_ssh_alert_count: number
  related_ssh_alerts_dismissed: boolean
}

export type HostSSHSummary = {
  port: number
  ssh_version: string | null
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  has_weak_ciphers: boolean
  has_weak_kex: boolean
  last_scanned: string
}

export type HostScanEntry = {
  id: number
  network_id: number
  network_name: string | null
  status: string
  started_at: string | null
  completed_at: string | null
  trigger_type: string
  port_count: number
}

export type HostOverviewResponse = {
  host: Host
  ports: EnrichedHostPort[]
  networks: HostNetworkInfo[]
  alerts: HostAlertSummary[]
  dismissed_alerts: HostAlertSummary[]
  dismissed_alert_count: number
  ssh: HostSSHSummary | null
  recent_scans: HostScanEntry[]
  matching_rules: PortRuleMatch[]
}

// Dismiss Suggestion types
export type DismissSuggestion = {
  reason: string
  frequency: number
  last_used: string | null
  same_port: boolean
}

export type DismissSuggestionsResponse = {
  suggestions: DismissSuggestion[]
}
