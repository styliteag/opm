"""Queue/policy state derivation for the UI v3 alert inbox.

Implements the server-side state dimensions from
docs/redesign/alert-state-action-matrix.md: queue_state is derived from
``dismissed``, policy_state from matching enabled *accepted* alert rules.
Rule criteria are JSON with port ranges, so matching runs in Python — for
list filtering it must be applied to the full candidate set BEFORE
pagination, never per page.
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_rule import AlertRule, RuleType
from app.services import alert_rules as alert_rules_service
from app.services.alert_rules import (
    FINDING_SOURCES,
    finding_identifier,
    finding_rule_matches_alert,
    port_rule_matches_alert,
    ssh_rule_matches_alert,
)

QUEUE_INBOX = "inbox"
QUEUE_OUT_OF_INBOX = "out_of_inbox"

POLICY_NONE = "none"
POLICY_ALLOWED_NETWORK = "allowed_network"
POLICY_ALLOWED_GLOBAL = "allowed_global"

# Accepted values for the ``policy_state`` query filter; "allowed" matches
# either scope.
POLICY_FILTER_VALUES = ("none", "allowed", "allowed_network", "allowed_global")


@dataclass(frozen=True)
class PolicyState:
    """Resolved policy dimension for one alert."""

    policy_state: str
    allow_rule_id: int | None
    allow_scope: str | None


NO_POLICY = PolicyState(POLICY_NONE, None, None)


def queue_state_for(dismissed: bool) -> str:
    return QUEUE_OUT_OF_INBOX if dismissed else QUEUE_INBOX


def _rule_matches(rule: AlertRule, alert: Alert) -> bool:
    if not rule.enabled or rule.rule_type != RuleType.ACCEPTED:
        return False
    if rule.source != alert.source:
        return False
    if alert.source == "port" and alert.port is not None:
        return port_rule_matches_alert(rule, alert.ip, alert.port)
    if alert.source == "ssh":
        return ssh_rule_matches_alert(rule, alert.ip, alert.port, alert.alert_type.value)
    if alert.source in FINDING_SOURCES:
        return finding_rule_matches_alert(rule, alert.ip, alert.port, finding_identifier(alert))
    return False


async def compute_policy_states(
    db: AsyncSession, alerts: list[Alert]
) -> dict[int, PolicyState]:
    """Resolve the policy state for each alert.

    Network-scoped rules win over global rules — the same resolution order
    the severity-rule generators use.
    """
    if not alerts:
        return {}

    global_rules = await alert_rules_service.get_global_rules(db)
    network_ids = {a.network_id for a in alerts if a.network_id is not None}
    network_rules: dict[int, list[AlertRule]] = {}
    for nid in network_ids:
        network_rules[nid] = await alert_rules_service.get_rules_by_network_id(db, nid)

    states: dict[int, PolicyState] = {}
    for alert in alerts:
        state = NO_POLICY
        if alert.network_id is not None:
            for rule in network_rules.get(alert.network_id, []):
                if _rule_matches(rule, alert):
                    state = PolicyState(POLICY_ALLOWED_NETWORK, rule.id, "network")
                    break
        if state.policy_state == POLICY_NONE:
            for rule in global_rules:
                if _rule_matches(rule, alert):
                    state = PolicyState(POLICY_ALLOWED_GLOBAL, rule.id, "global")
                    break
        states[alert.id] = state
    return states


def policy_filter_matches(state: PolicyState, policy_filter: str) -> bool:
    if policy_filter == "allowed":
        return state.policy_state != POLICY_NONE
    return state.policy_state == policy_filter
