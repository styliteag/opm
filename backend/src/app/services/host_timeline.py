"""Host activity timeline service for aggregating events across tables."""

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_host_timeline(
    db: AsyncSession,
    host_ip: str,
    limit: int = 50,
    before: datetime | None = None,
) -> list[dict[str, Any]]:
    """Fetch a unified timeline of events for a host IP.

    Aggregates events from alerts, open_ports, ssh_scan_results, nse_results,
    alert_comments, and alert_events into a single chronological feed with
    cursor-based pagination.
    """
    # Build cursor filter clause
    before_clause = ""
    params: dict[str, Any] = {"host_ip": host_ip, "lim": limit}
    if before is not None:
        before_clause = "AND ts < :before"
        params["before"] = before

    # Each sub-select produces (id, event_type, ts, title, description)
    # Uses || for concatenation (portable across SQLite and MariaDB)
    alerts_q = f"""
        SELECT
            id,
            'alert_created' AS event_type,
            created_at AS ts,
            'Alert: ' || SUBSTR(message, 1, 120) AS title,
            'Type: ' || alert_type
                || ' | Port: ' || COALESCE(CAST(port AS TEXT), '0') AS description
        FROM alerts
        WHERE ip = :host_ip {before_clause}
    """

    ports_q = f"""
        SELECT
            op.id,
            'port_discovered' AS event_type,
            op.first_seen_at AS ts,
            'Port ' || op.port || '/' || op.protocol || ' discovered' AS title,
            COALESCE(
                'Service: ' || op.service_guess,
                'No service info'
            ) AS description
        FROM open_ports op
        JOIN scans s ON s.id = op.scan_id
        WHERE op.ip = :host_ip {before_clause.replace("ts", "op.first_seen_at")}
    """

    ssh_q = f"""
        SELECT
            id,
            'ssh_scanned' AS event_type,
            timestamp AS ts,
            'SSH scan on port ' || port AS title,
            'Version: ' || COALESCE(ssh_version, 'unknown')
                || ' | Password: ' || CASE WHEN password_enabled THEN 'yes' ELSE 'no' END
                AS description
        FROM ssh_scan_results
        WHERE host_ip = :host_ip {before_clause.replace("ts", "timestamp")}
    """

    nse_q = f"""
        SELECT
            id,
            'vulnerability_found' AS event_type,
            created_at AS ts,
            'Vulnerability: ' || script_name AS title,
            'Severity: ' || severity
                || ' | Port: ' || port || '/' || protocol
                AS description
        FROM nse_results
        WHERE ip = :host_ip {before_clause}
    """

    comments_q = f"""
        SELECT
            ac.id,
            'alert_action' AS event_type,
            ac.created_at AS ts,
            COALESCE(u.email, 'system') || ': ' || SUBSTR(ac.comment, 1, 120) AS title,
            'Alert #' || a.id || ' | ' || a.alert_type AS description
        FROM alert_comments ac
        JOIN alerts a ON a.id = ac.alert_id
        LEFT JOIN users u ON u.id = ac.user_id
        WHERE a.ip = :host_ip {before_clause.replace("ts", "ac.created_at")}
    """

    alert_events_q = f"""
        SELECT
            ae.id,
            'alert_event:' || ae.event_type AS event_type,
            ae.occurred_at AS ts,
            COALESCE(u.email, 'system') || ': '
                || COALESCE(ae.description, ae.event_type) AS title,
            'Alert #' || a.id || ' | ' || a.alert_type
                || ' | Port: ' || COALESCE(CAST(a.port AS TEXT), '0') AS description
        FROM alert_events ae
        JOIN alerts a ON a.id = ae.alert_id
        LEFT JOIN users u ON u.id = ae.user_id
        WHERE a.ip = :host_ip {before_clause.replace("ts", "ae.occurred_at")}
    """

    full_query = f"""
        SELECT * FROM (
            {alerts_q}
            UNION ALL
            {ports_q}
            UNION ALL
            {ssh_q}
            UNION ALL
            {nse_q}
            UNION ALL
            {comments_q}
            UNION ALL
            {alert_events_q}
        ) AS timeline
        ORDER BY ts DESC
        LIMIT :lim
    """

    result = await db.execute(text(full_query), params)
    rows = result.all()

    return [
        {
            "id": row[0],
            "event_type": row[1],
            "timestamp": row[2].isoformat() if isinstance(row[2], datetime) else str(row[2]),
            "title": row[3],
            "description": row[4],
        }
        for row in rows
    ]
