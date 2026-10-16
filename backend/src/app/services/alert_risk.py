"""Accept risk for finding alerts (ADR 0012).

GVM/nuclei/NSE findings get a network-scoped severity rule lowering the
finding to ``info`` (below every alert threshold); SSH findings get an
accepted alert rule for that IP + alert type. Port alerts are not eligible —
they use Expected instead.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_event import AlertEventType
from app.models.alert_rule import RuleType
from app.services import alert_comments as alert_comments_service
from app.services import alert_rules as alert_rules_service
from app.services import severity_rules as severity_rules_service
from app.services.alert_events import emit_event
from app.services.alert_rules import FINDING_SOURCES, finding_identifier
from app.services.alert_state import dismiss_alert

ACCEPT_RISK_SEVERITY = "info"


def accept_risk_supported(alert: Alert) -> bool:
    """Return True when Accept risk applies to this alert's source."""
    return alert.source == "ssh" or alert.source in FINDING_SOURCES


async def accept_risk(
    db: AsyncSession,
    alert: Alert,
    *,
    reason: str,
    user_id: int,
) -> Alert | None:
    """Record an accepted risk for *alert* and dismiss it.

    Returns None when no rule can be written (unsupported source, or a
    finding alert without a finding identifier). Does not commit.
    """
    if alert.source in FINDING_SOURCES:
        oid = finding_identifier(alert)
        if oid is None:
            return None
        await severity_rules_service.upsert_rule(
            db,
            oid=oid,
            network_id=alert.network_id,
            severity_override=ACCEPT_RISK_SEVERITY,
            reason=reason,
            created_by_user_id=user_id,
        )
    elif alert.source == "ssh":
        criteria: dict[str, str | None] = {
            "ip": alert.ip,
            "alert_type": alert.alert_type.value,
        }
        if alert.port is not None:
            criteria["port"] = str(alert.port)
        await alert_rules_service.create_rule(
            db=db,
            source="ssh",
            rule_type=RuleType.ACCEPTED,
            match_criteria=criteria,
            network_id=alert.network_id,
            description=reason,
            created_by=user_id,
        )
    else:
        return None

    alert = await dismiss_alert(db, alert, dismiss_reason=reason)
    await alert_comments_service.create_comment(
        db, alert_id=alert.id, user_id=user_id, comment=reason
    )
    await emit_event(
        db,
        alert_id=alert.id,
        event_type=AlertEventType.DISMISSED,
        user_id=user_id,
        description=reason,
    )
    return alert
