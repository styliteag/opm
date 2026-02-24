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
export type ResolutionStatus = 'open' | 'in_progress' | 'resolved'

export type Alert = {
  id: number
  type: AlertType
  network_id: number | null
  network_name: string | null
  global_open_port_id: number | null
  ip: string
  port: number
  message: string
  acknowledged: boolean
  assigned_to_user_id: number | null
  assigned_to_email: string | null
  resolution_status: ResolutionStatus
  created_at: string
  severity: Severity
  // Host information (if available)
  host_id: number | null
  hostname: string | null
  user_comment: string | null
}

export type AlertListResponse = {
  alerts: Alert[]
}

export type BulkAcknowledgeResponse = {
  acknowledged_ids: number[]
  missing_ids: number[]
}

// Network types
export type ScannerType = 'masscan' | 'nmap'
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

export type OpenPortListResponse = {
  ports: OpenPort[]
}

// Port rule types
export type PortRule = {
  id: number
  network_id: number
  ip: string | null
  port: string
  rule_type: 'allow' | 'block'
  description: string | null
}

export type PortRuleListResponse = {
  rules: PortRule[]
}

export type PortRuleCreatePayload = {
  ip?: string | null
  port: string
  rule_type: 'allow' | 'block'
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
}

export type GlobalOpenPortListResponse = {
  ports: GlobalOpenPort[]
}

// Global Port Rule types
export type GlobalRuleType = 'allow' | 'block'

export type GlobalPortRule = {
  id: number
  ip: string | null
  port: string
  rule_type: GlobalRuleType
  description: string | null
  created_by: number | null
  created_at: string
}

export type GlobalPortRuleListResponse = {
  rules: GlobalPortRule[]
}

export type GlobalPortRuleCreatePayload = {
  ip?: string | null
  port: string
  rule_type?: GlobalRuleType
  description?: string | null
}

// Policy types
export type PolicyRule = {
  id: number
  network_id: number | null
  network_name: string | null
  ip: string | null
  port: string
  rule_type: 'allow' | 'block'
  description: string | null
  created_at?: string | null
  created_by?: number | null
}

export type PolicyListResponse = {
  rules: PolicyRule[]
}

export type PolicyCreatePayload = {
  network_id?: number | null
  ip?: string | null
  port: string
  rule_type: 'allow' | 'block'
  description?: string | null
}

export type PolicyUpdatePayload = {
  ip?: string | null
  port?: string | null
  rule_type?: 'allow' | 'block'
  description?: string | null
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

export type BulkDeleteHostsPayload = {
  host_ids: number[]
}

export type BulkDeleteHostsResponse = {
  deleted_ids: number[]
  deleted_count: number
}

export type HostUpdatePayload = {
  user_comment?: string | null
  hostname?: string | null
}

export type HostOpenPort = {
  id: number
  ip: string
  port: number
  protocol: string
  banner: string | null
  service_guess: string | null
  first_seen_at: string
  last_seen_at: string
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

// SSH Security types
export type SSHAlgorithm = {
  name: string
  keysize?: number | null
  is_weak: boolean
  notes?: string[]
}

export type SSHScanResult = {
  id: number
  scan_id: number
  host_ip: string
  port: number
  timestamp: string
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  ssh_version: string | null
  protocol_version: string | null
  server_banner: string | null
  supported_ciphers: SSHAlgorithm[] | null
  kex_algorithms: SSHAlgorithm[] | null
  host_key_types: string[] | null
  mac_algorithms: SSHAlgorithm[] | null
}

export type SSHConfigChange = {
  field: string
  description: string
  is_regression: boolean
}

export type SSHHostSummary = {
  host_ip: string
  port: number
  ssh_version: string | null
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  has_weak_ciphers: boolean
  has_weak_kex: boolean
  last_scan_id: number
  last_scanned: string
  network_id: number | null
  network_name: string | null
  // Change tracking fields
  change_status: 'improved' | 'degraded' | 'unchanged' | null
  changes: SSHConfigChange[]
}

export type SSHHostListResponse = {
  hosts: SSHHostSummary[]
  total: number
}

export type SSHHostHistoryEntry = {
  scan_id: number
  timestamp: string
  ssh_version: string | null
  publickey_enabled: boolean
  password_enabled: boolean
  keyboard_interactive_enabled: boolean
  supported_ciphers: SSHAlgorithm[] | null
  kex_algorithms: SSHAlgorithm[] | null
  host_key_types: string[] | null
  mac_algorithms: SSHAlgorithm[] | null
  network_id: number | null
  network_name: string | null
  // Note: protocol_version is not included in history entries, only in full scan results
}

export type SSHHostHistoryResponse = {
  host_ip: string
  port: number
  history: SSHHostHistoryEntry[]
  total: number
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
  acknowledged: boolean
  resolution_status: string
  created_at: string
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
  ports: HostOpenPort[]
  networks: HostNetworkInfo[]
  alerts: HostAlertSummary[]
  acknowledged_alert_count: number
  ssh: HostSSHSummary | null
  recent_scans: HostScanEntry[]
}
