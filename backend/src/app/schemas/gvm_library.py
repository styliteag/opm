"""Pydantic schemas for the GVM configuration library and per-scanner mirror."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

GvmKind = Literal["scan_config", "port_list"]


class GvmLibraryEntryResponse(BaseModel):
    """A library entry, without the XML blob."""

    id: int
    kind: GvmKind
    name: str
    xml_hash: str
    uploaded_by_user_id: int | None
    uploaded_by_username: str | None = None
    uploaded_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GvmLibraryListResponse(BaseModel):
    """List wrapper for library entries."""

    entries: list[GvmLibraryEntryResponse]


class GvmLibraryDeleteWarning(BaseModel):
    """Pre-delete warning listing the networks that reference an entry."""

    network_ids: list[int] = Field(default_factory=list)
    network_names: list[str] = Field(default_factory=list)


class GvmScannerMetadataEntryResponse(BaseModel):
    """A single row in a scanner's metadata mirror."""

    id: int
    scanner_id: int
    kind: GvmKind
    name: str
    gvm_uuid: str
    is_builtin: bool
    xml_hash: str | None
    extra: dict[str, Any] | None
    synced_at: datetime

    model_config = {"from_attributes": True}


class GvmScannerMirrorResponse(BaseModel):
    """Per-scanner mirror listing + sync metadata."""

    scanner_id: int
    scanner_name: str
    scanner_kind: str
    gvm_synced_at: datetime | None
    gvm_refresh_requested: bool
    entries: list[GvmScannerMetadataEntryResponse]


class GvmScannerRefreshResponse(BaseModel):
    """Response after triggering a metadata refresh."""

    scanner_id: int
    gvm_refresh_requested: bool
    message: str = "Refresh requested; scanner will post snapshot on next poll."


# --- Scanner-facing schemas (posted by the scanner agent) ------------


class GvmMetadataSnapshotEntry(BaseModel):
    """A single scan_config or port_list in the scanner's metadata push."""

    kind: GvmKind
    name: str
    gvm_uuid: str
    is_builtin: bool = False
    xml_hash: str | None = None
    extra: dict[str, Any] | None = None


class GvmMetadataSnapshotRequest(BaseModel):
    """Full metadata snapshot posted by a scanner on startup / interval / refresh."""

    entries: list[GvmMetadataSnapshotEntry]


class GvmMetadataSnapshotResponse(BaseModel):
    """Response after ingesting a snapshot."""

    scanner_id: int
    entries_stored: int
    message: str = "Snapshot ingested"


class RequiredLibraryEntry(BaseModel):
    """A library entry the scanner must have installed before running a scan.

    Embedded in the claim response. The scanner self-checks by name+hash
    against its own ``get_scan_configs()`` / ``get_port_lists()`` result and
    fetches the XML via ``GET /api/scanner/gvm-library`` only when missing
    or drifted.
    """

    kind: GvmKind
    name: str
    xml_hash: str
