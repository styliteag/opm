"""Alert model for security notifications."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.alert_comment import AlertComment
    from app.models.alert_event import AlertEvent
    from app.models.global_open_port import GlobalOpenPort
    from app.models.network import Network
    from app.models.scan import Scan
    from app.models.user import User


class AlertType(str, Enum):
    """Alert type values."""

    NEW_PORT = "new_port"
    NOT_ALLOWED = "not_allowed"
    BLOCKED = "blocked"
    # SSH security alert types
    SSH_INSECURE_AUTH = "ssh_insecure_auth"
    SSH_WEAK_CIPHER = "ssh_weak_cipher"
    SSH_WEAK_KEX = "ssh_weak_kex"
    SSH_OUTDATED_VERSION = "ssh_outdated_version"
    SSH_CONFIG_REGRESSION = "ssh_config_regression"
    # NSE vulnerability alert types
    NSE_VULNERABILITY = "nse_vulnerability"
    NSE_CVE_DETECTED = "nse_cve_detected"
    # GVM (Greenbone) vulnerability alert types
    GVM_VULNERABILITY = "gvm_vulnerability"
    GVM_CVE_DETECTED = "gvm_cve_detected"
    # Nuclei vulnerability alert types
    NUCLEI_VULNERABILITY = "nuclei_vulnerability"
    NUCLEI_CVE_DETECTED = "nuclei_cve_detected"


class Alert(Base):
    """Alert model for tracking security notifications."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), nullable=True, index=True)
    network_id: Mapped[int | None] = mapped_column(
        ForeignKey("networks.id"), nullable=True, index=True
    )
    global_open_port_id: Mapped[int | None] = mapped_column(
        ForeignKey("global_open_ports.id"), nullable=True, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(
        SQLEnum(AlertType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False, index=True, default="port")
    source_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    port: Mapped[int | None] = mapped_column(nullable=True, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dismiss_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    severity_override: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )

    # Relationships
    scan: Mapped["Scan | None"] = relationship("Scan", back_populates="alerts")
    network: Mapped["Network | None"] = relationship("Network", back_populates="alerts")
    global_open_port: Mapped["GlobalOpenPort | None"] = relationship("GlobalOpenPort")
    comments: Mapped[list["AlertComment"]] = relationship(
        "AlertComment", back_populates="alert", cascade="all, delete-orphan"
    )
    assigned_to: Mapped["User | None"] = relationship("User", back_populates="assigned_alerts")
    events: Mapped[list["AlertEvent"]] = relationship(
        "AlertEvent", back_populates="alert", cascade="all, delete-orphan"
    )
