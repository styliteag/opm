"""Organization schemas for API request/response validation."""

from datetime import datetime

from pydantic import BaseModel


class OrganizationResponse(BaseModel):
    """Response schema for organization settings."""

    id: int
    name: str
    description: str | None
    logo_url: str | None
    contact_email: str | None
    security_policy_url: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationUpdateRequest(BaseModel):
    """Request schema for updating organization settings."""

    name: str | None = None
    description: str | None = None
    logo_url: str | None = None
    contact_email: str | None = None
    security_policy_url: str | None = None
