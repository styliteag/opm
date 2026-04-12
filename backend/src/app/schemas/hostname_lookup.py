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


class CacheStatusByStatus(BaseModel):
    """Counts of cache rows grouped by lookup status."""

    success: int = 0
    no_results: int = 0
    failed: int = 0


class CacheBudgetStatus(BaseModel):
    """Per-source daily budget snapshot for the status dashboard."""

    source: str
    used: int
    limit: int
    remaining: int
    day: str  # ISO date


class CacheStatusResponse(BaseModel):
    """Status dashboard payload — stats for the ``/admin/hostname-lookup`` page.

    Answers "is the cache healthy and how much of the host inventory has
    been enriched yet?" in one round-trip so the UI can render its
    overview cards without per-metric requests.

    ``pending_queue_count`` surfaces outstanding work in the new
    on-demand queue (rows in ``pending`` or ``claimed`` state). The
    legacy ``filler_*`` fields remain during the 2.3.0 transition
    while the background filler is still present; Commit 10 strips
    them out alongside the filler itself.
    """

    filler_enabled: bool
    filler_interval_minutes: int
    total_entries: int
    entries_by_status: CacheStatusByStatus
    total_vhosts: int
    total_hosts: int
    enriched_hosts: int
    coverage_percent: float
    last_queried_at: datetime | None
    budgets: list[CacheBudgetStatus]
    pending_queue_count: int = 0


class CacheFillerRunResponse(BaseModel):
    """Response for the manual filler trigger endpoint."""

    status: str  # "started" | "skipped"
    message: str


class CacheEntryUpdateRequest(BaseModel):
    """Admin hand-edit payload for ``PUT /entries/{ip}``.

    ``hostnames`` is the full replacement list — the service layer
    strips whitespace, drops empties, and dedupes case-insensitively
    before writing. An empty list is valid and produces a
    ``no_results`` row so operators can explicitly mark an IP as
    "nothing worth scanning here".
    """

    hostnames: list[str] = Field(default_factory=list)


class CacheEntryHostnamesResponse(BaseModel):
    """Response for ``GET /api/hosts/{host_id}/hostnames``.

    Simple shape so the host detail page can render a "Known
    Hostnames" panel without parsing the full cache row.
    """

    ip: str
    hostnames: list[str]
    source: str | None
    queried_at: datetime | None
    expires_at: datetime | None


# --- Queue (on-demand manual lookup) ----------------------------------


QueueStatus = Literal["pending", "claimed", "completed", "failed"]


class HostnameLookupQueueEntryResponse(BaseModel):
    """One row of the on-demand hostname lookup queue.

    Returned by the scanner-facing ``GET /api/scanner/hostname-lookup-jobs``
    endpoint when claiming pending jobs, and as the ``queued`` payload of
    the user-facing refresh endpoints.
    """

    id: int
    ip: str
    status: QueueStatus
    requested_by_user_id: int | None
    requested_at: datetime
    claimed_at: datetime | None
    completed_at: datetime | None
    error_message: str | None

    model_config = {"from_attributes": True}


class HostnameLookupQueueListResponse(BaseModel):
    """Wrapper for the scanner job-claim response."""

    jobs: list[HostnameLookupQueueEntryResponse]


class HostnameLookupQueueCompleteRequest(BaseModel):
    """Body for ``POST /api/scanner/hostname-lookup-jobs/{id}/complete``.

    Scanner reports terminal state after running the enrichment chain
    against the queued IP and posting the results to the cache. The
    ``error`` field is only meaningful for ``failed`` and is bounded
    server-side before persisting.
    """

    status: Literal["completed", "failed"]
    error: str | None = Field(default=None, max_length=500)


class HostnameLookupRefreshResponse(BaseModel):
    """202 payload for the user/admin refresh trigger endpoints.

    Returns the freshly enqueued queue row so the UI can correlate
    "I clicked Refresh" with "scanner picked up job N at T+5s".
    """

    status: Literal["queued"] = "queued"
    queue_entry: HostnameLookupQueueEntryResponse


# --- Scanner-facing results + budget ---------------------------------


# Source names accepted by the scanner-facing /hostname-results endpoint.
# Only vhost-list providers belong here — ssl-cert / PTR / ip-api results
# are display names, not vhost lists, and continue to flow via the
# host-discovery endpoint instead.
ScannerHostnameSource = Literal["hackertarget", "rapiddns", "crt_sh"]


class HostnameLookupResultSubmission(BaseModel):
    """One enrichment outcome posted by the scanner.

    Mirrors the service-layer ``HostnameLookupResult`` shape so the
    backend can construct one and call ``upsert_cache_row`` directly.
    The hostname list is normalised (trim, dedupe) by the field
    validator before being persisted.
    """

    ip: str = Field(..., max_length=45)
    source: ScannerHostnameSource
    status: Literal["success", "no_results", "failed"]
    hostnames: list[str] = Field(default_factory=list)
    error_message: str | None = Field(default=None, max_length=500)

    @field_validator("hostnames")
    @classmethod
    def _strip_and_dedupe(cls, value: list[str]) -> list[str]:
        seen: dict[str, None] = {}
        for h in value:
            stripped = h.strip()
            if stripped:
                seen.setdefault(stripped, None)
        return list(seen.keys())


class HostnameLookupResultsRequest(BaseModel):
    """Bulk enrichment payload from scanner.

    A scanner posts one of these per enrichment cycle. The list may
    contain a mix of sources and statuses; each entry is processed
    independently and the response reports aggregate counts.
    """

    results: list[HostnameLookupResultSubmission]


class HostnameLookupResultsResponse(BaseModel):
    """Per-batch outcome counters returned to the scanner.

    The scanner uses these for log lines and self-throttling. The
    backend never rejects valid results — even when the budget counter
    is over, the cache write still happens because the data is
    valuable; ``budget_pinned_sources`` simply tells the scanner which
    sources to stop calling for the rest of the day.
    """

    accepted: int
    rejected: int
    cache_rows_written: int
    hosts_synced: int
    budget_pinned_sources: list[str] = Field(default_factory=list)


class HostnameLookupBudgetEntry(BaseModel):
    """Per-source daily budget snapshot for the scanner pre-flight check."""

    source: str
    used: int
    limit: int
    remaining: int


class HostnameLookupBudgetResponse(BaseModel):
    """Wrapper for ``GET /api/scanner/hostname-budget``.

    Returns one entry per known reverse-IP source so the scanner can
    decide whether to attempt a lookup before burning a request slot.
    The ``remaining`` field clamps to zero so the scanner never has
    to deal with negative numbers.
    """

    budgets: list[HostnameLookupBudgetEntry]
