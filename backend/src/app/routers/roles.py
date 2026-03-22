"""Roles information router."""

from typing import Any

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.core.permissions import get_role_info

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("")
async def list_roles(
    _user: CurrentUser,
) -> list[dict[str, Any]]:
    """List predefined roles with their permissions."""
    return get_role_info()
