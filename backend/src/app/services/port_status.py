"""Per-port triage status and "Why" text, shared by the Ports list and host overview.

Status precedence (UI v4 Ports page):
critical rule -> ``critical``; accepted rule -> ``expected``; open (undismissed)
port alert -> ``new``; dismissed port alert without a rule -> ``snoozed``;
otherwise ``review``.

"Why" precedence: port comment -> first matching rule description ->
dismiss reason of the port alert.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_rule import AlertRule
from app.models.global_open_port import GlobalOpenPort
from app.models.host import Host
from app.models.network import Network
from app.schemas.global_port import PortStatus
from app.schemas.host import PortRuleMatch
from app.services import alert_rules as alert_rules_service
from app.services.alert_rules import port_rule_matches_alert

# (rule, network_id, network_name) for network-scoped rules
NetworkRule = tuple[AlertRule, int, str]
PortKey = tuple[str, int]


@dataclass(frozen=True)
class PortEnrichment:
    """Derived triage fields for one global open port."""

    status: PortStatus
    why: str | None
    alert_id: int | None
    host_id: int | None
    hostname: str | None


def _rule_match(rule: AlertRule, scope: str, nid: int | None, name: str | None) -> PortRuleMatch:
    return PortRuleMatch(
        id=rule.id,
        scope=scope,
        network_id=nid,
        network_name=name,
        rule_type=rule.rule_type.value,
        description=rule.description,
        ip=rule.match_criteria.get("ip"),
    )


def match_port_rules(
    ip: str,
    port: int,
    global_rules: list[AlertRule],
    network_rules: list[NetworkRule],
) -> list[PortRuleMatch]:
    """Return every port-source rule (global first, then network) matching ip:port."""
    matches = [
        _rule_match(rule, "global", None, None)
        for rule in global_rules
        if port_rule_matches_alert(rule, ip, port)
    ]
    matches.extend(
        _rule_match(rule, "network", nid, name)
        for rule, nid, name in network_rules
        if port_rule_matches_alert(rule, ip, port)
    )
    return matches


def resolve_effective_rule(rules: list[PortRuleMatch]) -> str | None:
    """Pick the winning rule type by specificity. IP-specific > port-only.

    At the same specificity level, 'accepted' wins over 'critical'
    because it represents an explicit user override.
    """
    if not rules:
        return None
    best_score = 0
    best_type: str | None = None
    for r in rules:
        score = 2 if r.ip else 1
        if score > best_score or (score == best_score and r.rule_type == "accepted"):
            best_score = score
            best_type = r.rule_type
    return best_type


def port_status(rule_status: str | None, alert_status: str | None) -> PortStatus:
    """Map effective rule type + port alert state ('new'/'dismissed') to a status."""
    if rule_status == "critical":
        return "critical"
    if rule_status == "accepted":
        return "expected"
    if alert_status == "new":
        return "new"
    if alert_status == "dismissed":
        return "snoozed"
    return "review"


def port_why(
    user_comment: str | None,
    rules: list[PortRuleMatch],
    dismiss_reason: str | None,
) -> str | None:
    """Return the single "Why" text for a port."""
    if user_comment:
        return user_comment
    for rule in rules:
        if rule.description:
            return rule.description
    return dismiss_reason or None


def index_port_alerts(alerts: list[Alert]) -> dict[PortKey, tuple[Alert, str]]:
    """Index alerts by (ip, port); an undismissed alert wins over dismissed ones."""
    indexed: dict[PortKey, tuple[Alert, str]] = {}
    for alert in alerts:
        if alert.port is None:
            continue
        key = (alert.ip, alert.port)
        if key not in indexed:
            indexed[key] = (alert, "dismissed" if alert.dismissed else "new")
        elif not alert.dismissed:
            indexed[key] = (alert, "new")
    return indexed


async def load_network_rules(
    db: AsyncSession, network_ids: set[int]
) -> dict[int, list[NetworkRule]]:
    """Batch-load port-source rules for the given networks, keyed by network id."""
    if not network_ids:
        return {}
    names_result = await db.execute(
        select(Network.id, Network.name).where(Network.id.in_(network_ids))
    )
    names = {row[0]: row[1] for row in names_result.all()}
    rules_result = await db.execute(
        select(AlertRule)
        .where(AlertRule.source == "port", AlertRule.network_id.in_(network_ids))
        .order_by(AlertRule.id)
    )
    by_network: dict[int, list[NetworkRule]] = {}
    for rule in rules_result.scalars().all():
        nid = rule.network_id
        if nid is None:
            continue
        by_network.setdefault(nid, []).append((rule, nid, names.get(nid, "")))
    return by_network


async def enrich_global_ports(
    db: AsyncSession, ports: list[GlobalOpenPort]
) -> dict[int, PortEnrichment]:
    """Compute status/why/alert/host for each port with a fixed number of queries."""
    if not ports:
        return {}

    global_rules = await alert_rules_service.get_global_rules(db, source="port")
    network_ids = {nid for p in ports for nid in (p.seen_by_networks or [])}
    network_rules = await load_network_rules(db, network_ids)

    ips = {p.ip for p in ports}
    alerts_result = await db.execute(
        select(Alert).where(Alert.source == "port", Alert.ip.in_(ips))
    )
    alerts_by_port = index_port_alerts(list(alerts_result.scalars().all()))

    # Hosts by IP: older global_open_ports rows may have host_id unset.
    hosts_result = await db.execute(
        select(Host.id, Host.ip, Host.hostname).where(Host.ip.in_(ips))
    )
    hosts_by_ip = {row[1]: (row[0], row[2]) for row in hosts_result.all()}

    enriched: dict[int, PortEnrichment] = {}
    for p in ports:
        port_network_rules = [
            entry for nid in (p.seen_by_networks or []) for entry in network_rules.get(nid, [])
        ]
        rules = match_port_rules(p.ip, p.port, global_rules, port_network_rules)
        alert_info = alerts_by_port.get((p.ip, p.port))
        alert, alert_status = alert_info if alert_info else (None, None)
        host_id, hostname = hosts_by_ip.get(p.ip, (p.host_id, None))
        enriched[p.id] = PortEnrichment(
            status=port_status(resolve_effective_rule(rules), alert_status),
            why=port_why(p.user_comment, rules, alert.dismiss_reason if alert else None),
            alert_id=alert.id if alert else None,
            host_id=p.host_id if p.host_id is not None else host_id,
            hostname=hostname,
        )
    return enriched
