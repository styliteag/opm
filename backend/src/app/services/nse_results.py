"""NSE result storage and processing service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.nse_result import NseResult
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.nse import NseResultsSubmission, NseScriptResultPayload


async def get_results_by_scan(
    db: AsyncSession,
    scan_id: int,
    severity: str | None = None,
    ip: str | None = None,
) -> list[NseResult]:
    """Get NSE results for a specific scan with optional filtering."""
    stmt = select(NseResult).where(NseResult.scan_id == scan_id)

    if severity:
        stmt = stmt.where(NseResult.severity == severity)
    if ip:
        stmt = stmt.where(NseResult.ip == ip)

    stmt = stmt.order_by(NseResult.ip.asc(), NseResult.port.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_all_results(
    db: AsyncSession,
    scan_id: int | None = None,
    severity: str | None = None,
    ip: str | None = None,
    cve: str | None = None,
) -> list[NseResult]:
    """Get NSE results with optional filtering."""
    stmt = select(NseResult)

    if scan_id:
        stmt = stmt.where(NseResult.scan_id == scan_id)
    if severity:
        stmt = stmt.where(NseResult.severity == severity)
    if ip:
        stmt = stmt.where(NseResult.ip == ip)

    stmt = stmt.order_by(NseResult.created_at.desc())
    result = await db.execute(stmt)
    results = list(result.scalars().all())

    # Filter by CVE in Python (JSON column can't be queried with LIKE easily)
    if cve:
        cve_upper = cve.upper()
        results = [r for r in results if any(cve_upper in c.upper() for c in r.cve_ids)]

    return results


async def submit_nse_results(
    db: AsyncSession,
    scanner: Scanner,
    submission: NseResultsSubmission,
) -> int:
    """Process and store NSE scan results from the scanner agent.

    Returns the number of results recorded.
    """
    # Find and validate the scan
    scan_result = await db.execute(select(Scan).where(Scan.id == submission.scan_id))
    scan = scan_result.scalar_one_or_none()

    if scan is None or scan.scanner_id != scanner.id:
        return 0

    if scan.status not in {ScanStatus.RUNNING, ScanStatus.CANCELLED, ScanStatus.PLANNED}:
        import logging
        logging.getLogger(__name__).warning(
            "Rejecting NSE results for scan %d: status is %s (expected RUNNING/CANCELLED/PLANNED)",
            submission.scan_id,
            scan.status.value,
        )
        return 0

    is_cancelled = scan.status == ScanStatus.CANCELLED

    # Update scan status
    if not is_cancelled:
        if submission.status == "success":
            scan.status = ScanStatus.COMPLETED
        else:
            scan.status = ScanStatus.FAILED
        scan.completed_at = datetime.now(timezone.utc)
    else:
        if scan.completed_at is None:
            scan.completed_at = datetime.now(timezone.utc)

    if submission.error_message:
        scan.error_message = submission.error_message

    # Store NSE results
    results_recorded = 0
    for nse_data in submission.nse_results:
        nse_result = NseResult(
            scan_id=scan.id,
            ip=nse_data.ip,
            port=nse_data.port,
            protocol=nse_data.protocol,
            script_name=nse_data.script_name,
            script_output=nse_data.script_output,
            cve_ids=nse_data.cve_ids,
            severity=nse_data.severity,
            template_id=scan.nse_template_id,
        )
        db.add(nse_result)
        results_recorded += 1

    # Generate alerts for findings
    if not is_cancelled:
        await _generate_nse_alerts(db, scan, submission.nse_results)

    return results_recorded


async def _generate_nse_alerts(
    db: AsyncSession,
    scan: Scan,
    nse_findings: list[NseScriptResultPayload],
) -> int:
    """Generate alerts for NSE vulnerability findings.

    Deduplicates by (alert_type, ip, port) to avoid duplicate alerts.
    Returns count of alerts created.
    """
    alerts_created = 0

    for finding in nse_findings:
        # Skip findings with no meaningful output
        if not finding.script_output.strip():
            continue

        has_cves = len(finding.cve_ids) > 0
        is_vulnerable = "VULNERABLE" in finding.script_output.upper()

        # Only generate alerts for actual findings (CVEs or VULNERABLE marker)
        if not has_cves and not is_vulnerable:
            continue

        alert_type = AlertType.NSE_CVE_DETECTED if has_cves else AlertType.NSE_VULNERABILITY

        # Check for existing non-dismissed alert with same type+ip+port
        existing = await db.execute(
            select(Alert).where(
                and_(
                    Alert.alert_type == alert_type,
                    Alert.ip == finding.ip,
                    Alert.port == finding.port,
                    Alert.dismissed == False,  # noqa: E712
                )
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        # Build alert message
        cve_str = ", ".join(finding.cve_ids[:5]) if has_cves else ""
        if has_cves and len(finding.cve_ids) > 5:
            cve_str += f" (+{len(finding.cve_ids) - 5} more)"

        output_excerpt = finding.script_output[:300]
        if len(finding.script_output) > 300:
            output_excerpt += "..."

        message_parts = [
            f"NSE script '{finding.script_name}' found vulnerability on "
            f"{finding.ip}:{finding.port}/{finding.protocol}.",
        ]
        if cve_str:
            message_parts.append(f"CVEs: {cve_str}")
        message_parts.append(f"Output: {output_excerpt}")

        alert = Alert(
            scan_id=scan.id,
            network_id=scan.network_id,
            alert_type=alert_type,
            source="nse",
            ip=finding.ip,
            port=finding.port,
            message=" ".join(message_parts),
            severity_override=finding.severity,
        )
        db.add(alert)
        alerts_created += 1

    return alerts_created
