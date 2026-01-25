"""Email alert batching and sending service."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any, Iterable

from app.core.config import settings
from app.models.alert import Alert

logger = logging.getLogger(__name__)

BATCH_WINDOW_SECONDS = 300


@dataclass(frozen=True)
class AlertEmailItem:
    network_id: int | None
    network_name: str | None
    scan_id: int | None
    alert_type: str
    ip: str
    port: int
    message: str
    created_at: datetime


_queue: list[tuple[AlertEmailItem, tuple[str, ...]]] = []
_queue_lock = asyncio.Lock()
_flush_task: asyncio.Task[None] | None = None


def _normalize_recipients(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        raw = [item.strip() for item in value.split(",")]
        return [item for item in raw if item]
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value]
        return [item for item in cleaned if item]
    return []


def resolve_recipients(alert_config: dict[str, Any] | None) -> list[str]:
    """Resolve recipients from alert_config or global settings."""
    recipients: list[str] = []
    if alert_config:
        for key in ("email_recipients", "recipients"):
            if key in alert_config:
                recipients = _normalize_recipients(alert_config.get(key))
                break

    if not recipients:
        recipients = _normalize_recipients(settings.alert_email_recipients)

    # Deduplicate while preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for recipient in recipients:
        if recipient not in seen:
            seen.add(recipient)
            ordered.append(recipient)

    return ordered


async def queue_alert_emails(
    alerts: Iterable[Alert],
    network_name: str,
    alert_config: dict[str, Any] | None,
    scan_id: int,
) -> None:
    """Queue alert emails for batched delivery."""
    if not settings.smtp_host or not settings.smtp_from_address:
        logger.info("Email alerts skipped: SMTP not configured.")
        return

    recipients = resolve_recipients(alert_config)
    if not recipients:
        logger.info("Email alerts skipped: no recipients configured.")
        return

    now = datetime.now(timezone.utc)
    items = [
        AlertEmailItem(
            network_id=alert.network_id,
            network_name=network_name,
            scan_id=scan_id,
            alert_type=alert.alert_type.value,
            ip=alert.ip,
            port=alert.port,
            message=alert.message,
            created_at=now,
        )
        for alert in alerts
    ]

    if not items:
        return

    await _enqueue_items(items, recipients)


def _build_email_body(
    items: list[AlertEmailItem],
    base_url: str,
) -> str:
    counts: dict[str, int] = {}
    for item in items:
        counts[item.alert_type] = counts.get(item.alert_type, 0) + 1

    base_url = base_url.rstrip("/")
    alerts_url = f"{base_url}/alerts"

    lines = [
        "Open Port Monitor alert summary",
        f"Total alerts: {len(items)}",
    ]

    if counts:
        summary = ", ".join(f"{key}={value}" for key, value in sorted(counts.items()))
        lines.append(f"By type: {summary}")

    lines.append("")
    lines.append("Affected IPs/ports:")

    for item in items:
        context_parts = []
        if item.network_name:
            context_parts.append(item.network_name)
        if item.scan_id:
            context_parts.append(f"scan {item.scan_id}")
        context = f" ({', '.join(context_parts)})" if context_parts else ""
        lines.append(f"- {item.alert_type}{context} {item.ip}:{item.port} - {item.message}")

    lines.append("")
    lines.append(f"View alerts: {alerts_url}")
    return "\n".join(lines)


def _send_email_sync(recipients: list[str], subject: str, body: str) -> None:
    if not settings.smtp_host or not settings.smtp_from_address:
        logger.warning("SMTP not configured; skipping email alert send.")
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_address
    message["To"] = ", ".join(recipients)
    message.set_content(body)

    context = ssl.create_default_context()

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls(context=context)
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except Exception:
        logger.exception("Failed to send alert email.")


async def _send_email(recipients: list[str], subject: str, body: str) -> None:
    await asyncio.to_thread(_send_email_sync, recipients, subject, body)


async def _flush_queue() -> None:
    global _flush_task

    async with _queue_lock:
        items = list(_queue)
        _queue.clear()
        _flush_task = None

    if not items:
        return

    groups: dict[tuple[str, ...], list[AlertEmailItem]] = {}
    for item, recipients in items:
        groups.setdefault(recipients, []).append(item)

    base_url = settings.web_ui_url

    for recipients, group_items in groups.items():
        subject = f"Open Port Monitor Alerts ({len(group_items)})"
        body = _build_email_body(group_items, base_url)
        await _send_email(list(recipients), subject, body)


async def _flush_after_delay() -> None:
    try:
        await asyncio.sleep(BATCH_WINDOW_SECONDS)
        await _flush_queue()
    except Exception:
        logger.exception("Failed while processing batched alert emails.")


async def _enqueue_items(
    items: list[AlertEmailItem],
    recipients: list[str],
) -> None:
    global _flush_task

    recipients_key = tuple(recipients)
    async with _queue_lock:
        for item in items:
            _queue.append((item, recipients_key))

        if _flush_task is None or _flush_task.done():
            _flush_task = asyncio.create_task(_flush_after_delay())


async def queue_global_alert_emails(
    alerts: Iterable[Alert],
    network_name: str | None,
    alert_config: dict[str, Any] | None,
    scan_id: int | None,
) -> None:
    """Queue global alert emails for batched delivery."""
    if not settings.smtp_host or not settings.smtp_from_address:
        logger.info("Email alerts skipped: SMTP not configured.")
        return

    recipients = resolve_recipients(alert_config)
    if not recipients:
        logger.info("Email alerts skipped: no recipients configured.")
        return

    now = datetime.now(timezone.utc)
    items = [
        AlertEmailItem(
            network_id=alert.network_id,
            network_name=network_name,
            scan_id=scan_id,
            alert_type=alert.alert_type.value,
            ip=alert.ip,
            port=alert.port,
            message=alert.message,
            created_at=now,
        )
        for alert in alerts
    ]

    if not items:
        return

    await _enqueue_items(items, recipients)
