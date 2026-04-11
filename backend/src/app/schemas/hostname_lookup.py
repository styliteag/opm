"""Schemas for the hostname lookup cache — export / import payloads.

``HostnameLookupEntry`` is the per-row shape used in both the export
document (outgoing) and the import document (incoming). The import
side makes ``queried_at``/``expires_at`` optional so a hand-edited
bootstrap file can omit them and let the service layer compute sane
defaults.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class HostnameLookupEntry(BaseModel):
    """One row of the hostname lookup cache in transit.

    The ``hostnames`` field is always a list — empty for no_results /
    failed entries. ``error_message`` is only populated for ``failed``
    rows. Both timestamps default to ``None`` on the import side so
    operators can hand-craft a minimal bootstrap document with just
    ``ip`` + ``hostnames`` + ``status``.
    """

    ip: str = Field(..., max_length=45)
    hostnames: list[str] = Field(default_factory=list)
    source: str = Field(..., max_length=32)
    status: Literal["success", "no_results", "failed"]
    queried_at: datetime | None = None
    expires_at: datetime | None = None
    error_message: str | None = None

    @field_validator("hostnames")
    @classmethod
    def _strip_and_dedupe(cls, value: list[str]) -> list[str]:
        """Normalise inbound hostname lists: trim, drop empties, dedupe."""
        seen: dict[str, None] = {}
        for h in value:
            stripped = h.strip()
            if stripped:
                seen.setdefault(stripped, None)
        return list(seen.keys())


class CacheExportDocument(BaseModel):
    """Top-level shape of an exported cache snapshot."""

    format_version: int = 1
    exported_at: datetime
    source_instance: str = "opm"
    entry_count: int
    entries: list[HostnameLookupEntry]


class CacheImportRequest(BaseModel):
    """Import payload — mirrors the export document but tolerates
    partial metadata so operators can hand-write bootstrap files."""

    format_version: int = 1
    entries: list[HostnameLookupEntry]

    @field_validator("format_version")
    @classmethod
    def _check_version(cls, v: int) -> int:
        if v != 1:
            raise ValueError(
                f"Unsupported format_version={v}; this build only "
                f"understands version 1."
            )
        return v


class CacheImportSummary(BaseModel):
    """Per-IP outcome counts returned by ``/import``."""

    total: int
    inserted: int
    overwritten: int
    skipped: int
    rejected: int
    errors: list[str] = Field(default_factory=list)
