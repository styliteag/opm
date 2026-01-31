"""SSH security scan result endpoints."""

import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.deps import CurrentUser, DbSession
from app.schemas.ssh import (
    SSHHostHistoryEntry,
    SSHHostHistoryResponse,
    SSHHostListResponse,
    SSHHostSummary,
    SSHScanResultListResponse,
    SSHScanResultResponse,
)
from app.services import scans as scans_service
from app.services import ssh_results as ssh_service

router = APIRouter(prefix="/api", tags=["ssh"])

# Minimum SSH version threshold for "outdated" classification (major, minor)
MIN_SSH_VERSION = (8, 0)
MIN_SSH_VERSION_STR = f"{MIN_SSH_VERSION[0]}.{MIN_SSH_VERSION[1]}"


def _parse_ssh_version(version_str: str | None) -> tuple[int, int] | None:
    """Parse SSH version string to extract (major, minor) version tuple.

    Using tuple comparison instead of float avoids bugs where
    version "8.10" would incorrectly become 8.1 as a float.
    """
    if not version_str:
        return None
    import re
    match = re.search(r"OpenSSH[_\s]?(\d+)\.(\d+)", version_str, re.IGNORECASE)
    if match:
        return (int(match.group(1)), int(match.group(2)))
    return None


@router.get("/scans/{scan_id}/ssh", response_model=SSHScanResultListResponse)
async def get_scan_ssh_results(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
) -> SSHScanResultListResponse:
    """Get SSH security scan results for a specific scan."""
    # Verify scan exists
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    ssh_results = await ssh_service.get_ssh_results_for_scan(db, scan_id)
    return SSHScanResultListResponse(
        ssh_results=[SSHScanResultResponse.model_validate(r) for r in ssh_results]
    )


@router.get("/ssh/hosts", response_model=SSHHostListResponse)
async def list_ssh_hosts(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1, description="Filter by network ID"),
    password_enabled: bool | None = Query(
        None, description="Filter by password auth status"
    ),
    keyboard_interactive_enabled: bool | None = Query(
        None, description="Filter by keyboard-interactive auth status"
    ),
    ssh_version: str | None = Query(None, description="Filter by SSH version (partial match)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Number of results (max 200)"),
) -> SSHHostListResponse:
    """
    List all hosts with SSH data, showing the latest scan result for each host/port.

    Supports filtering by network, authentication methods, and SSH version.
    Returns paginated results with security status indicators.
    """
    hosts, total = await ssh_service.get_ssh_hosts(
        db,
        network_id=network_id,
        password_enabled=password_enabled,
        keyboard_interactive_enabled=keyboard_interactive_enabled,
        ssh_version=ssh_version,
        offset=offset,
        limit=limit,
    )

    return SSHHostListResponse(
        hosts=[SSHHostSummary(**h) for h in hosts],
        total=total,
    )


@router.get("/ssh/hosts/{host_ip}", response_model=SSHHostHistoryResponse)
async def get_ssh_host_history(
    user: CurrentUser,
    db: DbSession,
    host_ip: str,
    port: int = Query(22, ge=1, le=65535, description="SSH port number"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Number of results (max 200)"),
) -> SSHHostHistoryResponse:
    """
    Get SSH scan history for a specific host/port combination.

    Returns historical SSH scan results ordered by most recent first,
    allowing tracking of configuration changes over time.
    """
    history, total = await ssh_service.get_ssh_host_history(
        db,
        host_ip=host_ip,
        port=port,
        offset=offset,
        limit=limit,
    )

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No SSH scan results found for host {host_ip}:{port}",
        )

    return SSHHostHistoryResponse(
        host_ip=host_ip,
        port=port,
        history=[SSHHostHistoryEntry(**h) for h in history],
        total=total,
    )


@router.get("/ssh/export/pdf")
async def export_ssh_security_pdf(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1, description="Filter by network ID"),
) -> StreamingResponse:
    """
    Export SSH security compliance report as PDF.

    Includes executive summary, list of hosts with insecure auth,
    cipher analysis, and remediation recommendations.
    """
    # Get all SSH hosts for report
    hosts = await ssh_service.get_ssh_hosts_for_report(db, network_id=network_id)

    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements: list[Flowable] = []
    styles = getSampleStyleSheet()

    # Add title
    title = Paragraph("<b>SSH Security Compliance Report</b>", styles["Title"])
    elements.append(title)
    elements.append(Spacer(1, 0.2 * inch))

    # Add report metadata
    report_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    metadata_lines = [f"<b>Generated:</b> {report_date}"]
    if network_id:
        # Get network name if filtered
        network_name = hosts[0]["network_name"] if hosts else f"Network {network_id}"
        metadata_lines.append(f"<b>Network:</b> {network_name}")
    metadata_text = "<br/>".join(metadata_lines)
    metadata = Paragraph(metadata_text, styles["Normal"])
    elements.append(metadata)
    elements.append(Spacer(1, 0.3 * inch))

    # Calculate summary statistics
    total_hosts = len(hosts)
    hosts_with_insecure_auth = [
        h for h in hosts if h["password_enabled"] or h["keyboard_interactive_enabled"]
    ]
    hosts_with_weak_ciphers = [h for h in hosts if h["has_weak_ciphers"]]
    hosts_with_weak_kex = [h for h in hosts if h["has_weak_kex"]]
    hosts_with_outdated = [
        h for h in hosts
        if _parse_ssh_version(h["ssh_version"]) is not None
        and _parse_ssh_version(h["ssh_version"]) < MIN_SSH_VERSION  # type: ignore[operator]
    ]

    # Add executive summary
    summary_title = Paragraph("<b>Executive Summary</b>", styles["Heading2"])
    elements.append(summary_title)
    elements.append(Spacer(1, 0.1 * inch))

    summary_lines = [
        f"<b>Total SSH hosts scanned:</b> {total_hosts}",
        f"<b>Hosts with insecure authentication:</b> {len(hosts_with_insecure_auth)} "
        f"({_percentage(len(hosts_with_insecure_auth), total_hosts)})",
        f"<b>Hosts with weak ciphers:</b> {len(hosts_with_weak_ciphers)} "
        f"({_percentage(len(hosts_with_weak_ciphers), total_hosts)})",
        f"<b>Hosts with weak key exchange:</b> {len(hosts_with_weak_kex)} "
        f"({_percentage(len(hosts_with_weak_kex), total_hosts)})",
        f"<b>Hosts with outdated SSH (&lt;{MIN_SSH_VERSION_STR}):</b> {len(hosts_with_outdated)} "
        f"({_percentage(len(hosts_with_outdated), total_hosts)})",
    ]
    summary_text = "<br/>".join(summary_lines)
    summary = Paragraph(summary_text, styles["Normal"])
    elements.append(summary)
    elements.append(Spacer(1, 0.3 * inch))

    # Section: Hosts with Password/Keyboard-Interactive Auth
    if hosts_with_insecure_auth:
        auth_title = Paragraph(
            "<b>Hosts with Insecure Authentication</b>", styles["Heading2"]
        )
        elements.append(auth_title)
        elements.append(Spacer(1, 0.1 * inch))

        auth_intro = Paragraph(
            "The following hosts have password or keyboard-interactive authentication enabled, "
            "which is less secure than public key authentication.",
            styles["Normal"],
        )
        elements.append(auth_intro)
        elements.append(Spacer(1, 0.1 * inch))

        headers = ["IP", "Port", "SSH Version", "Auth Methods", "Network"]
        table_data = [headers]
        for h in hosts_with_insecure_auth:
            auth_methods = []
            if h["password_enabled"]:
                auth_methods.append("password")
            if h["keyboard_interactive_enabled"]:
                auth_methods.append("keyboard-interactive")
            if h["publickey_enabled"]:
                auth_methods.append("publickey")
            table_data.append([
                h["host_ip"],
                str(h["port"]),
                h["ssh_version"] or "Unknown",
                ", ".join(auth_methods),
                h["network_name"] or "",
            ])

        col_widths = [1.3 * inch, 0.6 * inch, 1.4 * inch, 2.0 * inch, 1.5 * inch]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 0.2 * inch))

        # Remediation recommendation
        remediation = Paragraph(
            "<b>Remediation:</b> Disable password authentication and keyboard-interactive "
            "authentication in sshd_config. Use public key authentication only.",
            styles["Normal"],
        )
        elements.append(remediation)
        elements.append(Spacer(1, 0.3 * inch))

    # Section: Cipher Analysis
    hosts_with_any_weak_crypto = [
        h for h in hosts
        if h["has_weak_ciphers"] or h["has_weak_kex"] or h.get("has_weak_macs", False)
    ]
    if hosts_with_any_weak_crypto:
        cipher_title = Paragraph("<b>Cipher Analysis - Weak Cryptography</b>", styles["Heading2"])
        elements.append(cipher_title)
        elements.append(Spacer(1, 0.1 * inch))

        cipher_intro = Paragraph(
            "The following hosts support weak cryptographic algorithms that should be disabled.",
            styles["Normal"],
        )
        elements.append(cipher_intro)
        elements.append(Spacer(1, 0.1 * inch))

        headers = ["IP", "Port", "Weak Ciphers", "Weak KEX", "Network"]
        table_data = [headers]
        for h in hosts_with_any_weak_crypto:
            weak_ciphers_str = ", ".join(h["weak_ciphers"][:3]) if h["weak_ciphers"] else "-"
            if len(h["weak_ciphers"]) > 3:
                weak_ciphers_str += f" (+{len(h['weak_ciphers']) - 3} more)"
            weak_kex_str = ", ".join(h["weak_kex"][:2]) if h["weak_kex"] else "-"
            if len(h["weak_kex"]) > 2:
                weak_kex_str += f" (+{len(h['weak_kex']) - 2} more)"
            table_data.append([
                h["host_ip"],
                str(h["port"]),
                weak_ciphers_str,
                weak_kex_str,
                h["network_name"] or "",
            ])

        col_widths = [1.2 * inch, 0.5 * inch, 2.0 * inch, 1.8 * inch, 1.3 * inch]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 0.2 * inch))

        # Remediation recommendation
        remediation = Paragraph(
            "<b>Remediation:</b> Update sshd_config to disable weak ciphers (DES, 3DES, RC4, "
            "Blowfish, CBC modes) and weak key exchange algorithms (diffie-hellman-group1-sha1). "
            "Use modern ciphers like chacha20-poly1305, aes256-gcm, and curve25519-sha256 for KEX.",
            styles["Normal"],
        )
        elements.append(remediation)
        elements.append(Spacer(1, 0.3 * inch))

    # Section: Outdated SSH Versions
    if hosts_with_outdated:
        version_title = Paragraph("<b>Outdated SSH Versions</b>", styles["Heading2"])
        elements.append(version_title)
        elements.append(Spacer(1, 0.1 * inch))

        version_intro = Paragraph(
            f"The following hosts are running SSH versions older than {MIN_SSH_VERSION_STR}, "
            "which may lack important security fixes.",
            styles["Normal"],
        )
        elements.append(version_intro)
        elements.append(Spacer(1, 0.1 * inch))

        headers = ["IP", "Port", "SSH Version", "Network", "Last Scanned"]
        table_data = [headers]
        for h in hosts_with_outdated:
            last_scanned = h["last_scanned"]
            if isinstance(last_scanned, datetime):
                last_scanned_str = last_scanned.strftime("%Y-%m-%d %H:%M")
            else:
                last_scanned_str = str(last_scanned)
            table_data.append([
                h["host_ip"],
                str(h["port"]),
                h["ssh_version"] or "Unknown",
                h["network_name"] or "",
                last_scanned_str,
            ])

        col_widths = [1.3 * inch, 0.6 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 0.2 * inch))

        # Remediation recommendation
        remediation = Paragraph(
            "<b>Remediation:</b> Update SSH server software to the latest stable version "
            f"(OpenSSH {MIN_SSH_VERSION_STR} or later) to receive security patches and improvements.",
            styles["Normal"],
        )
        elements.append(remediation)
        elements.append(Spacer(1, 0.3 * inch))

    # If no issues found, add a note
    if not hosts_with_insecure_auth and not hosts_with_any_weak_crypto and not hosts_with_outdated:
        if total_hosts == 0:
            no_data = Paragraph(
                "No SSH hosts have been scanned yet. Run a network scan to discover SSH services.",
                styles["Normal"],
            )
        else:
            no_data = Paragraph(
                "All scanned SSH hosts are compliant with security best practices. "
                "No insecure authentication methods, weak ciphers, or outdated versions detected.",
                styles["Normal"],
            )
        elements.append(no_data)

    # Build PDF
    doc.build(elements)
    pdf_content = buffer.getvalue()
    buffer.close()

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"ssh_security_report_{timestamp}.pdf"

    # Return as streaming response
    return StreamingResponse(
        iter([pdf_content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _percentage(count: int, total: int) -> str:
    """Calculate percentage string."""
    if total == 0:
        return "0%"
    return f"{(count / total) * 100:.1f}%"


@router.get("/ssh/export/csv")
async def export_ssh_security_csv(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1, description="Filter by network ID"),
) -> StreamingResponse:
    """
    Export SSH security data as CSV.

    Includes IP, Port, SSH Version, Auth Methods, Ciphers, KEX, and security status.
    """
    # Get all SSH hosts for export
    hosts = await ssh_service.get_ssh_hosts_for_report(db, network_id=network_id)

    # Create CSV in memory
    buffer = StringIO()
    writer = csv.writer(buffer)

    # Write header row
    writer.writerow([
        "IP",
        "Port",
        "SSH Version",
        "Publickey Auth",
        "Password Auth",
        "Keyboard-Interactive Auth",
        "Auth Status",
        "Ciphers (Weak)",
        "KEX Algorithms (Weak)",
        "Cipher Status",
        "KEX Status",
        "Version Status",
        "Overall Compliance",
        "Network",
        "Last Scanned",
    ])

    # Write data rows
    for host in hosts:
        # Determine auth status
        has_insecure_auth = host["password_enabled"] or host["keyboard_interactive_enabled"]
        auth_status = "Insecure" if has_insecure_auth else "Secure"

        # Determine cipher/KEX status
        cipher_status = "Weak" if host["has_weak_ciphers"] else "Secure"
        kex_status = "Weak" if host["has_weak_kex"] else "Secure"

        # Determine version status
        ssh_version = host["ssh_version"]
        parsed_version = _parse_ssh_version(ssh_version)
        if parsed_version is not None and parsed_version < MIN_SSH_VERSION:
            version_status = "Outdated"
        elif parsed_version is not None:
            version_status = "Current"
        else:
            version_status = "Unknown"

        # Overall compliance: non-compliant if any security issues
        is_compliant = (
            not has_insecure_auth
            and not host["has_weak_ciphers"]
            and not host["has_weak_kex"]
            and version_status != "Outdated"
        )
        overall_compliance = "Compliant" if is_compliant else "Non-Compliant"

        # Format weak ciphers and KEX
        weak_ciphers_str = ", ".join(host["weak_ciphers"]) if host["weak_ciphers"] else ""
        weak_kex_str = ", ".join(host["weak_kex"]) if host["weak_kex"] else ""

        # Format last scanned timestamp
        last_scanned = host["last_scanned"]
        if isinstance(last_scanned, datetime):
            last_scanned_str = last_scanned.strftime("%Y-%m-%d %H:%M:%S")
        else:
            last_scanned_str = str(last_scanned) if last_scanned else ""

        writer.writerow([
            host["host_ip"],
            host["port"],
            ssh_version or "",
            "Yes" if host["publickey_enabled"] else "No",
            "Yes" if host["password_enabled"] else "No",
            "Yes" if host["keyboard_interactive_enabled"] else "No",
            auth_status,
            weak_ciphers_str,
            weak_kex_str,
            cipher_status,
            kex_status,
            version_status,
            overall_compliance,
            host["network_name"] or "",
            last_scanned_str,
        ])

    # Get CSV content
    csv_content = buffer.getvalue()
    buffer.close()

    # Generate filename with date
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"ssh-security-{date_str}.csv"

    # Return as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
