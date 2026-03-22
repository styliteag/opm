"""Pydantic schemas for NSE vulnerability scanning."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


# --- Profile Schemas ---


class NseProfileCreate(BaseModel):
    """Request to create a custom NSE profile."""

    name: str
    description: str = ""
    nse_scripts: list[str]
    severity: str | None = None
    platform: str = "any"
    script_args: dict[str, Any] | None = None
    enabled: bool = True
    priority: int = 10

    @field_validator("nse_scripts")
    @classmethod
    def validate_scripts(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one NSE script is required")
        return [s.strip() for s in v if s.strip()]

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"critical", "high", "medium", "info"}
        if v not in allowed:
            raise ValueError(f"Severity must be one of: {', '.join(sorted(allowed))}")
        return v


class NseProfileUpdate(BaseModel):
    """Request to update a custom NSE profile."""

    name: str | None = None
    description: str | None = None
    nse_scripts: list[str] | None = None
    severity: str | None = None
    platform: str | None = None
    script_args: dict[str, Any] | None = None
    enabled: bool | None = None
    priority: int | None = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"critical", "high", "medium", "info"}
        if v not in allowed:
            raise ValueError(f"Severity must be one of: {', '.join(sorted(allowed))}")
        return v


class NseProfileResponse(BaseModel):
    """Profile information response."""

    id: int
    name: str
    description: str
    nse_scripts: list[str]
    severity: str | None
    platform: str
    type: str
    enabled: bool
    script_args: dict[str, Any] | None
    priority: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NseProfileListResponse(BaseModel):
    """Response containing list of profiles."""

    profiles: list[NseProfileResponse]
    total: int


# --- Script Schemas ---


class NseScriptCreate(BaseModel):
    """Request to create a custom NSE script."""

    name: str
    description: str = ""
    content: str
    categories: list[str] = []
    severity: str | None = None
    author: str = ""

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Script name is required")
        if not v.startswith("custom_"):
            v = f"custom_{v}"
        # Strip .nse suffix if provided — stored without extension
        if v.endswith(".nse"):
            v = v[:-4]
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Script content is required")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"critical", "high", "medium", "info"}
        if v not in allowed:
            raise ValueError(f"Severity must be one of: {', '.join(sorted(allowed))}")
        return v


class NseScriptUpdate(BaseModel):
    """Request to update a custom NSE script."""

    description: str | None = None
    content: str | None = None
    categories: list[str] | None = None
    severity: str | None = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"critical", "high", "medium", "info"}
        if v not in allowed:
            raise ValueError(f"Severity must be one of: {', '.join(sorted(allowed))}")
        return v


class NseScriptResponse(BaseModel):
    """Script information response."""

    id: int
    name: str
    description: str
    content: str
    content_hash: str
    categories: list[str]
    severity: str | None
    type: str
    cloned_from: str | None
    author: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NseScriptListItem(BaseModel):
    """Script list item (without full content for efficiency)."""

    id: int | None = None
    name: str
    description: str | None = None
    categories: list[str] = []
    severity: str | None = None
    type: str = "builtin"
    cloned_from: str | None = None
    author: str = ""


class NseScriptListResponse(BaseModel):
    """Response containing list of NSE scripts."""

    scripts: list[NseScriptListItem]
    total: int


class NseScriptDownloadResponse(BaseModel):
    """Script download response for scanner agents."""

    name: str
    content: str
    content_hash: str


# --- Scan Schemas ---


class NseScanRequest(BaseModel):
    """Request to trigger an NSE vulnerability scan using a profile."""

    network_id: int
    template_id: int
    target_ip: str | None = None

    @field_validator("target_ip")
    @classmethod
    def validate_target_ip(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                return None
        return v


class NseScanResponse(BaseModel):
    """Response after triggering an NSE scan."""

    scan_id: int
    network_id: int
    template_id: int
    status: str


# --- Result Schemas ---


class NseResultResponse(BaseModel):
    """Individual NSE finding response."""

    id: int
    scan_id: int
    ip: str
    port: int
    protocol: str
    script_name: str
    script_output: str
    cve_ids: list[str]
    severity: str
    template_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NseResultListResponse(BaseModel):
    """Response containing list of NSE results."""

    results: list[NseResultResponse]
    total: int


# --- Scanner Result Submission (from scanner agent) ---


class NseScriptResultPayload(BaseModel):
    """Single NSE script finding submitted by the scanner."""

    ip: str
    port: int
    protocol: str = "tcp"
    script_name: str
    script_output: str
    cve_ids: list[str] = []
    severity: str = "medium"


class NseResultsSubmission(BaseModel):
    """Batch submission of NSE results from the scanner agent."""

    scan_id: int
    nse_results: list[NseScriptResultPayload]
    status: str = "success"
    error_message: str | None = None
