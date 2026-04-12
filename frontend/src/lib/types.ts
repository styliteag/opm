// Manual types until OpenAPI codegen is set up with a running backend.
// These mirror the backend Pydantic schemas exactly.

export type AlertType =
  | "new_port"
  | "not_allowed"
  | "blocked"
  | "ssh_insecure_auth"
  | "ssh_weak_cipher"
  | "ssh_weak_kex"
  | "ssh_outdated_version"
  | "ssh_config_regression"
  | "nse_vulnerability"
  | "nse_cve_detected"
  | "gvm_vulnerability"
  | "gvm_cve_detected"
  | "nuclei_vulnerability"
  | "nuclei_cve_detected";

export type VulnerabilitySource = "gvm" | "nuclei";

export type Severity = "critical" | "high" | "medium" | "info";
export type VulnerabilitySeverity = Severity | "low";
export type ScanStatus =
  | "planned"
  | "running"
  | "completed"
  | "error"
  | "cancelled";
export type TriggerType = "manual" | "scheduled";
export type RuleType = "accepted" | "critical";

export interface PortRuleMatch {
  id: number;
  scope: "global" | "network";
  network_id: number | null;
  network_name: string | null;
  rule_type: RuleType;
  description: string | null;
  ip: string | null;
}

export interface AlertSSHSummary {
  ssh_version: string | null;
  publickey_enabled: boolean;
  password_enabled: boolean;
  keyboard_interactive_enabled: boolean;
  has_weak_ciphers: boolean;
  has_weak_kex: boolean;
  last_scanned: string;
}

export interface Alert {
  id: number;
  type: AlertType;
  source: string;
  network_id: number | null;
  network_name: string | null;
  global_open_port_id: number | null;
  ip: string;
  port: number | null;
  message: string;
  dismissed: boolean;
  assigned_to_user_id: number | null;
  assigned_to_email: string | null;
  created_at: string;
  dismiss_reason: string | null;
  severity: Severity;
  severity_override: Severity | null;
  host_id: number | null;
  hostname: string | null;
  user_comment: string | null;
  last_comment: string | null;
  last_comment_by: string | null;
  last_comment_at: string | null;
  ssh_summary: AlertSSHSummary | null;
  related_ssh_alert_count: number;
  related_ssh_alerts_dismissed: boolean;
  matching_rules: PortRuleMatch[];
}

export interface AlertListResponse {
  alerts: Alert[];
  total: number;
  severity_counts: Record<string, number>;
}

export interface DismissSuggestion {
  reason: string;
  frequency: number;
  last_used: string | null;
  same_port: boolean;
}

export interface AlertComment {
  id: number;
  alert_id: number;
  user_id: number;
  user_email: string;
  content: string;
  created_at: string;
  updated_at: string | null;
}

export interface Network {
  id: number;
  name: string;
  cidr: string;
  port_spec: string;
  scanner_id: number;
  scan_schedule: string | null;
  scan_rate: number | null;
  scan_timeout: number | null;
  port_timeout: number | null;
  scanner_type: string;
  scan_protocol: string;
  alert_config: Record<string, unknown> | null;
  nse_profile_id: number | null;
  host_discovery_enabled: boolean;
  scan_schedule_enabled: boolean;
  phases: ScanPhase[] | null;
  gvm_scan_config: string | null;
  gvm_port_list: string | null;
  gvm_keep_reports: boolean;
  ssh_probe_enabled: boolean;
  nuclei_enabled: boolean;
  nuclei_tags: string | null;
  nuclei_exclude_tags: string | null;
  nuclei_severity: string | null;
  nuclei_timeout: number | null;
  nuclei_sni_enabled: boolean;
  is_ipv6: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScanPhase {
  name: "host_discovery" | "port_scan" | "vulnerability";
  enabled: boolean;
  tool: string;
  config: Record<string, unknown>;
}

export interface NetworkListResponse {
  networks: Network[];
}

export interface LastScanSummary {
  id: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  trigger_type: string;
  port_count: number;
}

export interface NetworkOverviewResponse {
  network: Network;
  host_count: number;
  active_alert_count: number;
  alert_severity_distribution: Record<string, number>;
  open_port_count: number;
  scan_success_rate: number;
  total_scans_30d: number;
  completed_scans_30d: number;
  last_scan: LastScanSummary | null;
  scanner_name: string;
  scanner_online: boolean;
}

export interface ScanSummary {
  id: number;
  network_id: number;
  scanner_id: number;
  status: ScanStatus;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_email: string | null;
  error_message: string | null;
  trigger_type: TriggerType;
  hidden: boolean;
  progress_percent: number | null;
  progress_message: string | null;
  actual_rate: number | null;
  port_count: number;
}

export interface LatestScanEntry {
  network_id: number;
  scan: ScanSummary | null;
}

export interface LatestScansByNetworkResponse {
  latest_scans: LatestScanEntry[];
}

export type ScannerKind = "standard" | "gvm";
export type GvmKind = "scan_config" | "port_list";

export interface Scanner {
  id: number;
  name: string;
  description: string | null;
  location?: string | null;
  last_seen_at: string | null;
  scanner_version: string | null;
  kind: ScannerKind;
  gvm_refresh_requested?: boolean;
  gvm_synced_at?: string | null;
  created_at?: string;
}

export interface GvmLibraryEntry {
  id: number;
  kind: GvmKind;
  name: string;
  xml_hash: string;
  uploaded_by_user_id: number | null;
  uploaded_by_username: string | null;
  uploaded_at: string;
  updated_at: string;
}

export interface GvmLibraryListResponse {
  entries: GvmLibraryEntry[];
}

export interface GvmScannerMetadataEntry {
  id: number;
  scanner_id: number;
  kind: GvmKind;
  name: string;
  gvm_uuid: string;
  is_builtin: boolean;
  xml_hash: string | null;
  extra: Record<string, unknown> | null;
  synced_at: string;
}

export interface GvmScannerMirrorResponse {
  scanner_id: number;
  scanner_name: string;
  scanner_kind: ScannerKind;
  gvm_synced_at: string | null;
  gvm_refresh_requested: boolean;
  entries: GvmScannerMetadataEntry[];
}

export interface GvmScannerRefreshResponse {
  scanner_id: number;
  gvm_refresh_requested: boolean;
  message: string;
}

export interface ScannerListResponse {
  scanners: Scanner[];
}

export interface ScannerNetworkInfo {
  id: number;
  name: string;
  cidr: string;
  scan_schedule: string | null;
}

export interface ScannerScanSummary {
  id: number;
  network_id: number;
  network_name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  trigger_type: string;
  port_count: number;
  duration_seconds: number | null;
}

export interface ScannerOverviewResponse {
  scanner: Scanner;
  networks: ScannerNetworkInfo[];
  recent_scans: ScannerScanSummary[];
  total_scans: number;
  completed_scans: number;
  failed_scans: number;
  avg_scan_duration_seconds: number | null;
  scans_last_24h: number;
  scans_last_7d: number;
}

export interface Host {
  id: number;
  ip: string;
  hostname: string | null;
  is_pingable: boolean | null;
  mac_address: string | null;
  mac_vendor: string | null;
  first_seen_at: string;
  last_seen_at: string;
  user_comment: string | null;
  seen_by_networks: number[];
  open_port_count: number | null;
  // Cached vhost projection from `hostname_lookup_cache` — populated
  // by the list endpoint via a single batch JOIN. The detail endpoint
  // leaves these as 0/null and the host detail page reads the full
  // list via `useHostHostnames(id)` instead.
  cached_hostname_count: number;
  cached_display_hostname: string | null;
}

export interface HostListResponse {
  hosts: Host[];
  total_count: number;
  pingable_count: number;
}

export interface HostOpenPort {
  id: number;
  ip: string;
  port: number;
  protocol: string;
  banner: string | null;
  service_guess: string | null;
  user_comment: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_stale: boolean;
}

export interface EnrichedHostPort extends HostOpenPort {
  alert_id: number | null;
  alert_status: "new" | "dismissed" | null;
  alert_severity: string | null;
  dismiss_reason: string | null;
  rule_status: RuleType | null;
  matching_rules: PortRuleMatch[];
  ssh_summary: AlertSSHSummary | null;
  is_stale: boolean;
}

export interface HostAlertSummary {
  id: number;
  type: string;
  port: number;
  message: string;
  severity: string;
  dismissed: boolean;
  created_at: string;
  dismiss_reason: string | null;
  network_id: number | null;
  network_name: string | null;
  ssh_summary: AlertSSHSummary | null;
  related_ssh_alert_count: number;
  related_ssh_alerts_dismissed: boolean;
}

export interface HostScanEntry {
  id: number;
  network_id: number;
  network_name: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  trigger_type: string;
  port_count: number;
}

export interface HostOverviewResponse {
  host: Host;
  ports: EnrichedHostPort[];
  networks: { id: number; name: string; cidr: string }[];
  alerts: HostAlertSummary[];
  dismissed_alerts: HostAlertSummary[];
  dismissed_alert_count: number;
  ssh: AlertSSHSummary | null;
  recent_scans: HostScanEntry[];
  matching_rules: PortRuleMatch[];
}

export interface HostRiskTrendPoint {
  date: string;
  score: number;
}

export interface HostRiskTrendResponse {
  points: HostRiskTrendPoint[];
}

export interface TrendDataPoint {
  date: string;
  count: number;
}

export interface AlertTrendDataPoint extends TrendDataPoint {
  dismissed_count: number;
}

export interface TrendDataResponse {
  data: TrendDataPoint[];
}

export interface AlertTrendDataResponse {
  data: AlertTrendDataPoint[];
}

export interface Vulnerability {
  id: number;
  scan_id: number;
  ip: string;
  port: number | null;
  protocol: string;
  oid: string;
  name: string;
  description: string;
  severity: number;
  severity_label: VulnerabilitySeverity;
  cvss_base_vector: string | null;
  cve_ids: string[];
  solution: string | null;
  solution_type: string | null;
  qod: number | null;
  source: VulnerabilitySource;
  created_at: string;
}

export interface VulnerabilityListResponse {
  results: Vulnerability[];
  total: number;
}

export interface NseResult {
  id: number;
  scan_id: number;
  ip: string;
  port: number;
  protocol: string;
  script_name: string;
  script_output: string;
  cve_ids: string[];
  severity: Severity;
  template_id: number | null;
  created_at: string;
}

export interface NseResultListResponse {
  results: NseResult[];
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Alert Timeline                                                     */
/* ------------------------------------------------------------------ */

export interface TimelineEvent {
  id: number;
  event_type: string;
  user_id: number | null;
  user_email: string | null;
  scan_id: number | null;
  description: string | null;
  extra: Record<string, unknown> | null;
  occurred_at: string;
}

export interface ScanGroup {
  scan_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  status: string | null;
  port_seen: boolean;
  events: TimelineEvent[];
}

export interface AlertTimelineResponse {
  alert_id: number;
  scan_groups: ScanGroup[];
}

/* ------------------------------------------------------------------ */
/*  Host Timeline                                                      */
/* ------------------------------------------------------------------ */

export interface HostTimelineEvent {
  id: number;
  event_type: string;
  timestamp: string;
  title: string;
  description: string;
}

export interface HostTimelineResponse {
  events: HostTimelineEvent[];
}
