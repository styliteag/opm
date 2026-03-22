"""Permission system for role-based access control."""

from enum import Enum
from typing import Any

from fastapi import Depends, HTTPException, status

from app.models.user import User, UserRole


class Permission(str, Enum):
    """Granular permissions for RBAC."""

    # Administration
    MANAGE_USERS = "manage_users"
    MANAGE_ORGANIZATION = "manage_organization"

    # Infrastructure
    MANAGE_NETWORKS = "manage_networks"
    MANAGE_SCANNERS = "manage_scanners"
    MANAGE_PORT_RULES = "manage_port_rules"
    TRIGGER_SCANS = "trigger_scans"
    MANAGE_NSE = "manage_nse"

    # Alert triage
    MANAGE_ALERTS = "manage_alerts"

    # Export
    EXPORT_DATA = "export_data"

    # Read-only (all authenticated users)
    VIEW_DASHBOARD = "view_dashboard"
    VIEW_NETWORKS = "view_networks"
    VIEW_HOSTS = "view_hosts"
    VIEW_SCANS = "view_scans"
    VIEW_ALERTS = "view_alerts"
    VIEW_TRENDS = "view_trends"
    VIEW_POLICY = "view_policy"
    VIEW_SCANNERS = "view_scanners"


_VIEW_PERMISSIONS = frozenset(
    {
        Permission.VIEW_DASHBOARD,
        Permission.VIEW_NETWORKS,
        Permission.VIEW_HOSTS,
        Permission.VIEW_SCANS,
        Permission.VIEW_ALERTS,
        Permission.VIEW_TRENDS,
        Permission.VIEW_POLICY,
        Permission.VIEW_SCANNERS,
    }
)

ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.ADMIN: frozenset(Permission),
    UserRole.OPERATOR: _VIEW_PERMISSIONS
    | frozenset(
        {
            Permission.MANAGE_NETWORKS,
            Permission.MANAGE_SCANNERS,
            Permission.MANAGE_PORT_RULES,
            Permission.TRIGGER_SCANS,
            Permission.MANAGE_NSE,
            Permission.MANAGE_ALERTS,
            Permission.EXPORT_DATA,
        }
    ),
    UserRole.ANALYST: _VIEW_PERMISSIONS
    | frozenset(
        {
            Permission.MANAGE_ALERTS,
            Permission.EXPORT_DATA,
        }
    ),
    UserRole.VIEWER: _VIEW_PERMISSIONS,
}


def has_permission(user: User, permission: Permission) -> bool:
    """Check if a user has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(user.role, frozenset())


def require_permission(*permissions: Permission) -> Any:
    """Create a FastAPI dependency that checks permissions."""
    from app.core.deps import CurrentUser

    async def _check(current_user: CurrentUser) -> User:
        for perm in permissions:
            if not has_permission(current_user, perm):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions",
                )
        return current_user

    return Depends(_check)


def get_role_info() -> list[dict[str, Any]]:
    """Return role definitions with their permissions for the API."""
    return [
        {
            "name": role.value,
            "description": _ROLE_DESCRIPTIONS[role],
            "permissions": sorted(p.value for p in perms),
        }
        for role, perms in ROLE_PERMISSIONS.items()
    ]


_ROLE_DESCRIPTIONS: dict[UserRole, str] = {
    UserRole.ADMIN: "Full access to all system features including user and organization management.",
    UserRole.OPERATOR: "Manage networks, scanners, port rules, and NSE profiles. Triage alerts. Cannot manage users or organization settings.",
    UserRole.ANALYST: "Triage and manage alerts. Read-only access to infrastructure. Cannot modify networks, scanners, or rules.",
    UserRole.VIEWER: "Read-only access to all dashboards, alerts, and scan results.",
}
