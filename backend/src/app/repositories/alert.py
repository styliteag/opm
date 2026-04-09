"""Alert repository for complex alert queries and aggregations."""

from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import Integer, String, and_, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.host import Host
from app.models.network import Network
from app.repositories.base import BaseRepository

SSH_ALERT_TYPES = frozenset(
    {
        AlertType.SSH_INSECURE_AUTH,
        AlertType.SSH_WEAK_CIPHER,
        AlertType.SSH_WEAK_KEX,
        AlertType.SSH_OUTDATED_VERSION,
        AlertType.SSH_CONFIG_REGRESSION,
    }
)

PORT_ALERT_TYPES = frozenset(
    {
        AlertType.NEW_PORT,
        AlertType.NOT_ALLOWED,
        AlertType.BLOCKED,
    }
)


class AlertRepository(BaseRepository[Alert]):
    model = Alert

    SORTABLE_COLUMNS: ClassVar[dict[str, Any]] = {
        "severity": Alert.alert_type,
        "message": Alert.message,
        "ip": Alert.ip,
        "port": Alert.port,
        "network_name": Network.name,
        "created_at": Alert.created_at,
    }

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    @staticmethod
    def build_filters(
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
        filters: list[Any] = []
        if alert_type is not None:
            filters.append(Alert.alert_type == alert_type)
        if source is not None:
            filters.append(Alert.source == source)
        if network_id is not None:
            filters.append(Alert.network_id == network_id)
        if dismissed is not None:
            filters.append(Alert.dismissed.is_(dismissed))
        if ip is not None:
            filters.append(Alert.ip == ip)
        if port is not None:
            filters.append(Alert.port == port)
        if search:
            term = f"%{search}%"
            filters.append(
                or_(
                    Alert.ip.ilike(term),
                    Alert.message.ilike(term),
                    Network.name.ilike(term),
                    Host.hostname.ilike(term),
                    Alert.port.cast(String).ilike(term),
                )
            )
        if start_date is not None:
            filters.append(Alert.created_at >= start_date)
        if end_date is not None:
            filters.append(Alert.created_at <= end_date)
        return filters

    async def get_with_network_name(
        self, alert_id: int
    ) -> tuple[Alert, str | None] | None:
        """Get an alert with its network name (may be None for global alerts)."""
        result = await self._session.execute(
            select(Alert, Network.name)
            .outerjoin(Network, Alert.network_id == Network.id)
            .where(Alert.id == alert_id)
        )
        row = result.first()
        if row is None:
            return None
        network_name = str(row[1]) if row[1] is not None else None
        return row[0], network_name

    async def get_by_ids(self, alert_ids: list[int]) -> list[Alert]:
        """Fetch alerts by IDs."""
        return await self.get_many(alert_ids)

    async def count_filtered(
        self,
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
        """Count alerts matching filters (no pagination)."""
        query = select(func.count(Alert.id)).outerjoin(
            Network, Alert.network_id == Network.id
        )

        if search:
            query = query.outerjoin(Host, Alert.ip == Host.ip)

        filters = self.build_filters(
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
        if filters:
            query = query.where(and_(*filters))

        result = await self._session.execute(query)
        return result.scalar_one()

    async def list_with_network_name(
        self,
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
        """List alerts with optional filters and pagination."""
        query = select(Alert, Network.name).outerjoin(
            Network, Alert.network_id == Network.id
        )

        if search:
            query = query.outerjoin(Host, Alert.ip == Host.ip)

        filters = self.build_filters(
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

        if filters:
            query = query.where(and_(*filters))

        col = self.SORTABLE_COLUMNS.get(sort_by or "")
        if col is not None:
            order = col.asc() if sort_dir == "asc" else col.desc()
            query = query.order_by(order, Alert.id.desc())
        else:
            query = query.order_by(Alert.created_at.desc(), Alert.id.desc())

        query = query.offset(offset).limit(limit)
        result = await self._session.execute(query)
        return [
            (row[0], str(row[1]) if row[1] is not None else None)
            for row in result.all()
        ]

    async def get_ssh_alert_summary_for_ips(
        self,
        ips: set[str],
    ) -> dict[tuple[str, int], tuple[int, bool]]:
        """Get SSH alert count and all-dismissed status for (ip, port) pairs."""
        if not ips:
            return {}

        result = await self._session.execute(
            select(
                Alert.ip,
                Alert.port,
                func.count(Alert.id),
                func.min(Alert.dismissed.cast(Integer)),
            )
            .where(
                Alert.ip.in_(ips),
                Alert.alert_type.in_(list(SSH_ALERT_TYPES)),
            )
            .group_by(Alert.ip, Alert.port)
        )

        lookup: dict[tuple[str, int], tuple[int, bool]] = {}
        for ip, port, count, min_acked in result.all():
            lookup[(ip, port)] = (count, bool(min_acked))
        return lookup

    async def get_port_alert_status_for_ips(
        self,
        ip_port_pairs: set[tuple[str, int]],
    ) -> dict[tuple[str, int], tuple[int, bool, str | None]]:
        """Get the most relevant port-type alert for each (ip, port)."""
        if not ip_port_pairs:
            return {}

        ips = {pair[0] for pair in ip_port_pairs}
        result = await self._session.execute(
            select(Alert)
            .where(
                Alert.ip.in_(ips),
                Alert.alert_type.in_(list(PORT_ALERT_TYPES)),
            )
            .order_by(Alert.dismissed.asc(), Alert.created_at.desc())
        )
        alerts = result.scalars().all()

        lookup: dict[tuple[str, int], tuple[int, bool, str | None]] = {}
        for alert in alerts:
            if alert.port is None:
                continue
            key = (alert.ip, alert.port)
            if key in ip_port_pairs and key not in lookup:
                lookup[key] = (alert.id, alert.dismissed, alert.dismiss_reason)
        return lookup

    async def get_dismiss_reason_suggestions(
        self,
        *,
        port: int | None = None,
        search: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, object]]:
        """Get previously used dismiss reasons ranked by port affinity and frequency."""
        filters: list[Any] = [
            Alert.dismissed.is_(True),
            Alert.dismiss_reason.isnot(None),
            Alert.dismiss_reason != "",
        ]

        if search:
            filters.append(Alert.dismiss_reason.ilike(f"%{search}%"))

        same_port_expr = (
            func.sum(case((Alert.port == port, 1), else_=0))
            if port is not None
            else literal(0)
        )

        query = (
            select(
                Alert.dismiss_reason,
                func.count(Alert.id).label("frequency"),
                func.max(Alert.created_at).label("last_used"),
                same_port_expr.label("same_port_count"),
            )
            .where(and_(*filters))
            .group_by(Alert.dismiss_reason)
            .order_by(
                same_port_expr.desc(),
                func.count(Alert.id).desc(),
                func.max(Alert.created_at).desc(),
            )
            .limit(limit)
        )

        result = await self._session.execute(query)
        rows = result.all()

        return [
            {
                "reason": row[0],
                "frequency": row[1],
                "last_used": row[2].isoformat() if row[2] else None,
                "same_port": bool(row[3] and row[3] > 0),
            }
            for row in rows
        ]
