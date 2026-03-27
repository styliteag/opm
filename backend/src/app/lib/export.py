"""Shared export utilities for CSV and PDF report generation."""

import csv
from collections.abc import Generator
from contextlib import contextmanager
from datetime import datetime, timezone
from io import BytesIO, StringIO
from typing import Any

from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def export_timestamp() -> str:
    """Return a UTC timestamp string suitable for filenames."""
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def csv_response(rows: list[list[Any]], headers: list[str], filename: str) -> StreamingResponse:
    """Build a CSV StreamingResponse from rows and headers."""
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    content = output.getvalue()
    output.close()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def pdf_response(buffer: BytesIO, filename: str) -> StreamingResponse:
    """Wrap a built PDF buffer in a StreamingResponse."""
    content = buffer.getvalue()
    buffer.close()
    return StreamingResponse(
        iter([content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def default_table_style() -> TableStyle:
    """Return the standard table style used in all PDF exports."""
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
            ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
        ]
    )


@contextmanager
def build_pdf(
    title_text: str,
    generated_at: str | None = None,
) -> Generator[tuple[list[Flowable], Any], None, None]:
    """Context manager that yields (elements, styles) for building a PDF.

    Usage::

        buffer = BytesIO()
        with build_pdf("My Report") as (elements, styles):
            elements.append(Paragraph("Hello", styles["Normal"]))
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        doc.build(elements)
    """
    styles = getSampleStyleSheet()
    elements: list[Flowable] = []

    title = Paragraph(f"<b>{title_text}</b>", styles["Title"])
    elements.append(title)
    elements.append(Spacer(1, 0.2 * inch))

    report_date = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    metadata = Paragraph(f"<b>Generated:</b> {report_date}", styles["Normal"])
    elements.append(metadata)
    elements.append(Spacer(1, 0.3 * inch))

    yield elements, styles


def make_pdf_table(
    headers: list[str],
    rows: list[list[Any]],
    col_widths: list[float],
    empty_message: str = "No data found.",
) -> Flowable:
    """Build a styled PDF table or return a placeholder paragraph if empty."""
    styles = getSampleStyleSheet()
    if not rows:
        return Paragraph(empty_message, styles["Normal"])
    table_data = [headers, *rows]
    table = Table(table_data, colWidths=col_widths)
    table.setStyle(default_table_style())
    return table


def new_pdf_buffer() -> tuple[BytesIO, SimpleDocTemplate]:
    """Create a fresh BytesIO buffer and SimpleDocTemplate."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    return buffer, doc
