"""NSE result storage and processing service."""

from __future__ import annotations

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.nse_result import NseResult
from app.models.vulnerability import Vulnerability
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.nse import NseResultsSubmission, NseScriptResultPayload
from app.schemas.vulnerability import VulnerabilityResultData, VulnerabilitySeverityLabel
from app.services.severity_rules import resolve_overrides as _resolve_severity_overrides
from app.services.vulnerability_results import _severity_below_threshold

_SEVERITY_SCORES: dict[str, float] = {
    "info": 0.0,
    "low": 2.0,
    "medium": 5.0,
    "high": 8.0,
    "critical": 10.0,
}


def _nse_oid(script_name: str) -> str:
    """Build the stable synthetic OID used for NSE findings and severity rules."""
    return f"nse:{script_name}"


def _to_vulnerability_payload(nse_data: NseScriptResultPayload) -> VulnerabilityResultData:
    """Project an NSE finding into the shared vulnerability shape."""
    severity_label = VulnerabilitySeverityLabel(nse_data.severity)
    severity = _SEVERITY_SCORES[severity_label.value]
    description = nse_data.script_output.strip()
    solution = None
    if nse_data.cve_ids:
        solution = "Review referenced CVEs and script output for remediation guidance."
    return VulnerabilityResultData(
        ip=nse_data.ip,
        port=nse_data.port if nse_data.port > 0 else None,
        protocol=nse_data.protocol,
        oid=_nse_oid(nse_data.script_name),
        name=nse_data.script_name,
        description=description,
        severity=severity,
        severity_label=severity_label,
        cve_ids=list(nse_data.cve_ids),
        solution=solution,
        solution_type="Detection",
        qod=100,
        source="nse",
    )


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

    # NOTE: Do NOT update scan status here. NSE results are an intermediate
    # step in the scan pipeline. The main /api/scanner/results endpoint is
    # responsible for transitioning the scan to COMPLETED/FAILED after all
    # phases (port scan + NSE + SSH probes) have finished.

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
        vuln_data = _to_vulnerability_payload(nse_data)
        db.add(
            Vulnerability(
                scan_id=scan.id,
                ip=vuln_data.ip,
                port=vuln_data.port,
                protocol=vuln_data.protocol,
                oid=vuln_data.oid,
                name=vuln_data.name,
                description=vuln_data.description,
                severity=vuln_data.severity,
                severity_label=vuln_data.severity_label,
                cvss_base_vector=vuln_data.cvss_base_vector,
                cve_ids=vuln_data.cve_ids,
                solution=vuln_data.solution,
                solution_type=vuln_data.solution_type,
                qod=vuln_data.qod,
                source=vuln_data.source,
            )
        )
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
    """Generate alerts for NSE findings using the shared severity-rule model.

    Applies the same per-OID severity-override table used by GVM/nuclei with a
    default alert threshold of ``medium``.
    Returns count of alerts created.
    """
    findings = [_to_vulnerability_payload(finding) for finding in nse_findings]
    if not findings:
        return 0

    overrides = await _resolve_severity_overrides(
        db, scan.network_id, [finding.oid for finding in findings]
    )
    alertable: list[tuple[VulnerabilityResultData, str]] = []
    candidate_keys: list[str] = []
    for finding in findings:
        effective_severity = overrides.get(finding.oid, finding.severity_label.value)
        if _severity_below_threshold(effective_severity, None):
            continue
        key = _build_nse_source_key(scan.network_id, finding)
        alertable.append((finding, effective_severity))
        candidate_keys.append(key)

    if not alertable:
        return 0

    existing = await db.execute(
        select(Alert.source_key).where(
            and_(
                Alert.source_key.in_(candidate_keys),
                Alert.dismissed == False,  # noqa: E712
            )
        )
    )
    existing_keys: set[str] = {row[0] for row in existing}

    alerts_created = 0
    for finding, effective_severity in alertable:
        if not finding.description.strip():
            continue
        source_key = _build_nse_source_key(scan.network_id, finding)
        if source_key in existing_keys:
            continue

        has_cves = len(finding.cve_ids) > 0
        alert_type = AlertType.NSE_CVE_DETECTED if has_cves else AlertType.NSE_VULNERABILITY

        # Build alert message
        cve_str = ", ".join(finding.cve_ids[:5]) if has_cves else ""
        if has_cves and len(finding.cve_ids) > 5:
            cve_str += f" (+{len(finding.cve_ids) - 5} more)"

        output_excerpt = finding.description[:300]
        if len(finding.description) > 300:
            output_excerpt += "..."

        message_parts = [
            f"NSE script '{finding.name}' found a finding on "
            f"{finding.ip}:{finding.port}/{finding.protocol}.",
        ]
        if cve_str:
            message_parts.append(f"CVEs: {cve_str}")
        message_parts.append(f"Output: {output_excerpt}")
        if effective_severity != finding.severity_label.value:
            message_parts.append(
                f"(severity promoted from {finding.severity_label.value} "
                f"to {effective_severity} via rule)"
            )

        alert = Alert(
            scan_id=scan.id,
            network_id=scan.network_id,
            alert_type=alert_type,
            source="nse",
            source_key=source_key,
            ip=finding.ip,
            port=finding.port,
            message=" ".join(message_parts),
            severity_override=effective_severity,
        )
        db.add(alert)
        alerts_created += 1

    return alerts_created


def _build_nse_source_key(network_id: int, finding: VulnerabilityResultData) -> str:
    """Return a stable identity for an NSE alert source finding."""
    port = str(finding.port) if finding.port is not None else "host"
    return f"nse:{network_id}:{finding.ip}:{port}:{finding.protocol}:{finding.oid}"
