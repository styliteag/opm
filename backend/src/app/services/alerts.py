"""Alert generation and retrieval services for alerts.

This module is a re-export facade. All implementations live in:
- alert_queries: CRUD, filtering, dismissing, reopening, auto-dismiss, status summaries
- port_rule_matching: Port range parsing and matching utilities
- alert_generation: Port-based alert generation
- ssh_alert_generation: SSH alert generation
"""

# --- alert_generation ---
from app.services.alert_generation import (
    AlertKey,
    GlobalAlertKey,
    _get_enabled_alert_types,
    _get_open_ports_for_scan,
    _get_pending_alerts,
    _get_pending_global_alerts,
    _get_previous_scan_ports,
    _get_severity_overrides,
    _should_create_alert,
    generate_alerts_for_scan,
    generate_global_alerts_for_scan,
)

# --- alert_queries ---
from app.services.alert_queries import (
    PORT_ALERT_TYPES,
    SSH_ALERT_TYPES,
    auto_dismiss_alerts_for_accepted_rule,
    auto_dismiss_alerts_for_nse_rule,
    auto_dismiss_alerts_for_ssh_rule,
    delete_alerts_by_ids,
    dismiss_alert,
    dismiss_alerts,
    get_alert_with_network_name,
    get_alerts,
    get_alerts_by_ids,
    get_dismiss_reason_suggestions,
    get_port_alert_status_for_ips,
    get_ssh_alert_summary_for_ips,
    propagate_dismiss_reason_to_port_and_host,
    reopen_alert,
)

# --- port_rule_matching ---
from app.services.port_rule_matching import (
    PortKey,
    _build_ip_rule_ranges,
    _build_port_ranges,
    _combine_ranges,
    _parse_port_range,
    _port_in_ranges,
)

# --- ssh_alert_generation ---
from app.services.ssh_alert_generation import (
    DEFAULT_SSH_VERSION_THRESHOLD,
    SSHAlertKey,
    SSHResultKey,
    _detect_ssh_improvements,
    _detect_ssh_regressions,
    _extract_weak_algorithms,
    _get_algorithm_names,
    _get_pending_ssh_alerts,
    _get_previous_ssh_results,
    _get_weak_algorithm_names,
    _is_version_outdated,
    _parse_ssh_version,
    generate_ssh_alerts_for_scan,
    generate_ssh_regression_alerts_for_scan,
)

__all__ = [
    # Type aliases
    "AlertKey",
    "GlobalAlertKey",
    "PortKey",
    "SSHAlertKey",
    "SSHResultKey",
    # Constants
    "DEFAULT_SSH_VERSION_THRESHOLD",
    "PORT_ALERT_TYPES",
    "SSH_ALERT_TYPES",
    # Backward-compat aliases
    "_is_version_outdated",
    "_parse_ssh_version",
    # alert_queries
    "auto_dismiss_alerts_for_accepted_rule",
    "auto_dismiss_alerts_for_nse_rule",
    "auto_dismiss_alerts_for_ssh_rule",
    "delete_alerts_by_ids",
    "dismiss_alert",
    "dismiss_alerts",
    "get_alert_with_network_name",
    "get_alerts",
    "get_alerts_by_ids",
    "get_dismiss_reason_suggestions",
    "get_port_alert_status_for_ips",
    "get_ssh_alert_summary_for_ips",
    "propagate_dismiss_reason_to_port_and_host",
    "reopen_alert",
    # port_rule_matching
    "_build_ip_rule_ranges",
    "_build_port_ranges",
    "_combine_ranges",
    "_parse_port_range",
    "_port_in_ranges",
    # alert_generation
    "_get_enabled_alert_types",
    "_get_open_ports_for_scan",
    "_get_pending_alerts",
    "_get_pending_global_alerts",
    "_get_previous_scan_ports",
    "_get_severity_overrides",
    "_should_create_alert",
    "generate_alerts_for_scan",
    "generate_global_alerts_for_scan",
    # ssh_alert_generation
    "_detect_ssh_improvements",
    "_detect_ssh_regressions",
    "_extract_weak_algorithms",
    "_get_algorithm_names",
    "_get_pending_ssh_alerts",
    "_get_previous_ssh_results",
    "_get_weak_algorithm_names",
    "generate_ssh_alerts_for_scan",
    "generate_ssh_regression_alerts_for_scan",
]
