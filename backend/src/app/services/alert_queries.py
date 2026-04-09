"""Alert queries — thin delegation layer.

All data access is in repositories/alert.py (AlertRepository).
State transitions are in services/alert_state.py.
Auto-dismiss orchestration is in services/alert_auto_dismiss.py.

This module re-exports everything for backward compatibility with existing
callers that import from alert_queries.
"""

# Re-export constants
# --- Compatibility wrappers for callers using module-level functions ---
# These delegate to AlertRepository methods so existing callers don't break.
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.repositories.alert import PORT_ALERT_TYPES as PORT_ALERT_TYPES
from app.repositories.alert import SSH_ALERT_TYPES as SSH_ALERT_TYPES

# Re-export repository class for direct use
from app.repositories.alert import AlertRepository as AlertRepository

# Re-export auto-dismiss functions
from app.services.alert_auto_dismiss import (
    auto_dismiss_alerts_for_accepted_rule as auto_dismiss_alerts_for_accepted_rule,
)
from app.services.alert_auto_dismiss import (
    auto_dismiss_alerts_for_nse_rule as auto_dismiss_alerts_for_nse_rule,
)
from app.services.alert_auto_dismiss import (
    auto_dismiss_alerts_for_ssh_rule as auto_dismiss_alerts_for_ssh_rule,
)

# Re-export state transition functions
from app.services.alert_state import delete_alerts_by_ids as delete_alerts_by_ids
from app.services.alert_state import dismiss_alert as dismiss_alert
from app.services.alert_state import dismiss_alerts as dismiss_alerts
from app.services.alert_state import (
    propagate_dismiss_reason_to_port_and_host as propagate_dismiss_reason_to_port_and_host,
)
from app.services.alert_state import reopen_alert as reopen_alert

# Preserve the old SORTABLE_COLUMNS import
SORTABLE_COLUMNS: dict[str, Any] = AlertRepository.SORTABLE_COLUMNS


def _build_alert_filters(
    *,
    alert_type: AlertType | None = None,
    source: str | None = None,
    network_id: int | None = None,
    dismissed: bool | None = None,
    ip: str | None = None,
    port: int | None = None,
    search: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[Any]:
    """Build reusable filter conditions for alert queries."""
    return AlertRepository.build_filters(
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )


async def get_alert_with_network_name(
    db: AsyncSession, alert_id: int
) -> tuple[Alert, str | None] | None:
    return await AlertRepository(db).get_with_network_name(alert_id)


async def get_alerts_by_ids(db: AsyncSession, alert_ids: list[int]) -> list[Alert]:
    return await AlertRepository(db).get_by_ids(alert_ids)


async def count_alerts(
    db: AsyncSession,
    *,
    alert_type: AlertType | None = None,
    source: str | None = None,
    network_id: int | None = None,
    dismissed: bool | None = None,
    ip: str | None = None,
    port: int | None = None,
    search: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> int:
    return await AlertRepository(db).count_filtered(
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )


async def get_alerts(
    db: AsyncSession,
    *,
    alert_type: AlertType | None = None,
    source: str | None = None,
    network_id: int | None = None,
    dismissed: bool | None = None,
    ip: str | None = None,
    port: int | None = None,
    search: str | None = None,
    sort_by: str | None = None,
    sort_dir: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = 0,
    limit: int = 50,
) -> list[tuple[Alert, str | None]]:
    return await AlertRepository(db).list_with_network_name(
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )


async def get_ssh_alert_summary_for_ips(
    db: AsyncSession,
    ips: set[str],
) -> dict[tuple[str, int], tuple[int, bool]]:
    return await AlertRepository(db).get_ssh_alert_summary_for_ips(ips)


async def get_port_alert_status_for_ips(
    db: AsyncSession,
    ip_port_pairs: set[tuple[str, int]],
) -> dict[tuple[str, int], tuple[int, bool, str | None]]:
    return await AlertRepository(db).get_port_alert_status_for_ips(ip_port_pairs)


async def get_dismiss_reason_suggestions(
    db: AsyncSession,
    *,
    port: int | None = None,
    search: str | None = None,
    limit: int = 20,
) -> list[dict[str, object]]:
    return await AlertRepository(db).get_dismiss_reason_suggestions(
        port=port, search=search, limit=limit
    )
