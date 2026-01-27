"""Alert comment schemas for CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, Field


class AlertCommentCreate(BaseModel):
    """Request schema for creating an alert comment."""

    comment: str = Field(..., min_length=1, max_length=10000)


class AlertCommentUpdate(BaseModel):
    """Request schema for updating an alert comment."""

    comment: str = Field(..., min_length=1, max_length=10000)


class AlertCommentResponse(BaseModel):
    """Response schema for an alert comment."""

    id: int
    alert_id: int
    user_id: int
    user_email: str
    comment: str
    created_at: datetime
    updated_at: datetime


class AlertCommentListResponse(BaseModel):
    """Response schema for list of alert comments."""

    comments: list[AlertCommentResponse]
