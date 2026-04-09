"""Alert type metadata registry."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AlertTypeInfo:
    """Metadata for a registered alert type."""

    alert_type: str
    label: str
    category: str
    default_severity: str
    description: str


_registry: dict[str, AlertTypeInfo] = {}


def register_alert_type(
    alert_type: str,
    label: str,
    category: str,
    default_severity: str,
    description: str,
) -> None:
    """Register an alert type with metadata."""
    _registry[alert_type] = AlertTypeInfo(
        alert_type=alert_type,
        label=label,
        category=category,
        default_severity=default_severity,
        description=description,
    )


def get_alert_type_metadata() -> list[dict[str, str]]:
    """Return list of registered alert types with metadata."""
    return [
        {
            "alert_type": info.alert_type,
            "label": info.label,
            "category": info.category,
            "source": info.category,  # alias for frontend
            "default_severity": info.default_severity,
            "description": info.description,
        }
        for info in _registry.values()
    ]


# Register built-in alert types
register_alert_type(
    "new_port",
    label="New Port",
    category="port",
    default_severity="medium",
    description="A new open port was discovered that was not seen in previous scans.",
)
register_alert_type(
    "not_allowed",
    label="Not Allowed",
    category="port",
    default_severity="high",
    description="An open port was found that violates the network's allow-list policy.",
)
register_alert_type(
    "blocked",
    label="Blocked",
    category="port",
    default_severity="critical",
    description="An open port was found that matches the network's block-list policy.",
)
register_alert_type(
    "ssh_insecure_auth",
    label="SSH Insecure Auth",
    category="ssh",
    default_severity="high",
    description="SSH service allows password or keyboard-interactive authentication.",
)
register_alert_type(
    "ssh_weak_cipher",
    label="SSH Weak Cipher",
    category="ssh",
    default_severity="medium",
    description="SSH service supports weak encryption ciphers.",
)
register_alert_type(
    "ssh_weak_kex",
    label="SSH Weak KEX",
    category="ssh",
    default_severity="medium",
    description="SSH service supports weak key exchange algorithms.",
)
register_alert_type(
    "ssh_outdated_version",
    label="SSH Outdated",
    category="ssh",
    default_severity="medium",
    description="SSH service is running an outdated version below the configured threshold.",
)
register_alert_type(
    "ssh_config_regression",
    label="SSH Regression",
    category="ssh",
    default_severity="high",
    description="SSH security configuration has degraded compared to the previous scan.",
)
register_alert_type(
    "gvm_vulnerability",
    label="GVM Vulnerability",
    category="gvm",
    default_severity="high",
    description="Greenbone vulnerability scanner found a vulnerability without known CVEs.",
)
register_alert_type(
    "gvm_cve_detected",
    label="GVM CVE",
    category="gvm",
    default_severity="high",
    description="Greenbone vulnerability scanner found a vulnerability with known CVEs.",
)
