"""Tests for the RBAC permissions module."""

import pytest

from app.core.permissions import (
    ROLE_PERMISSIONS,
    Permission,
    get_role_info,
    has_permission,
)
from app.models.user import UserRole


class _FakeUser:
    """Lightweight stand-in for User to avoid SQLAlchemy instrumentation."""

    def __init__(self, role: UserRole) -> None:
        self.id = 1
        self.email = "test@example.com"
        self.role = role


def _make_user(role: UserRole) -> _FakeUser:  # type: ignore[return-type]
    """Create a minimal user-like object for testing."""
    return _FakeUser(role)


class TestRolePermissions:
    """Test that role-permission mappings are correct."""

    def test_admin_has_all_permissions(self) -> None:
        admin_perms = ROLE_PERMISSIONS[UserRole.ADMIN]
        for perm in Permission:
            assert perm in admin_perms, f"Admin missing {perm}"

    def test_viewer_has_only_view_permissions(self) -> None:
        viewer_perms = ROLE_PERMISSIONS[UserRole.VIEWER]
        for perm in viewer_perms:
            assert perm.value.startswith("view_"), f"Viewer has non-view perm: {perm}"

    def test_viewer_cannot_manage(self) -> None:
        viewer_perms = ROLE_PERMISSIONS[UserRole.VIEWER]
        manage_perms = [p for p in Permission if p.value.startswith("manage_")]
        for perm in manage_perms:
            assert perm not in viewer_perms, f"Viewer has manage perm: {perm}"

    def test_operator_can_manage_infrastructure(self) -> None:
        operator_perms = ROLE_PERMISSIONS[UserRole.OPERATOR]
        assert Permission.MANAGE_NETWORKS in operator_perms
        assert Permission.MANAGE_SCANNERS in operator_perms
        assert Permission.MANAGE_PORT_RULES in operator_perms
        assert Permission.TRIGGER_SCANS in operator_perms
        assert Permission.MANAGE_NSE in operator_perms

    def test_operator_cannot_manage_users_or_org(self) -> None:
        operator_perms = ROLE_PERMISSIONS[UserRole.OPERATOR]
        assert Permission.MANAGE_USERS not in operator_perms
        assert Permission.MANAGE_ORGANIZATION not in operator_perms

    def test_analyst_can_manage_alerts(self) -> None:
        analyst_perms = ROLE_PERMISSIONS[UserRole.ANALYST]
        assert Permission.MANAGE_ALERTS in analyst_perms
        assert Permission.EXPORT_DATA in analyst_perms

    def test_analyst_cannot_manage_infrastructure(self) -> None:
        analyst_perms = ROLE_PERMISSIONS[UserRole.ANALYST]
        assert Permission.MANAGE_NETWORKS not in analyst_perms
        assert Permission.MANAGE_SCANNERS not in analyst_perms
        assert Permission.TRIGGER_SCANS not in analyst_perms

    def test_all_roles_have_view_permissions(self) -> None:
        for role in UserRole:
            perms = ROLE_PERMISSIONS[role]
            assert Permission.VIEW_DASHBOARD in perms, f"{role} missing VIEW_DASHBOARD"
            assert Permission.VIEW_ALERTS in perms, f"{role} missing VIEW_ALERTS"
            assert Permission.VIEW_HOSTS in perms, f"{role} missing VIEW_HOSTS"


class TestHasPermission:
    """Test the has_permission helper function."""

    def test_admin_has_any_permission(self) -> None:
        user = _make_user(UserRole.ADMIN)
        assert has_permission(user, Permission.MANAGE_USERS)
        assert has_permission(user, Permission.VIEW_DASHBOARD)
        assert has_permission(user, Permission.MANAGE_ALERTS)

    def test_viewer_lacks_manage_permissions(self) -> None:
        user = _make_user(UserRole.VIEWER)
        assert not has_permission(user, Permission.MANAGE_USERS)
        assert not has_permission(user, Permission.MANAGE_ALERTS)
        assert not has_permission(user, Permission.TRIGGER_SCANS)

    def test_viewer_has_view_permissions(self) -> None:
        user = _make_user(UserRole.VIEWER)
        assert has_permission(user, Permission.VIEW_DASHBOARD)
        assert has_permission(user, Permission.VIEW_ALERTS)

    def test_analyst_can_manage_alerts_but_not_networks(self) -> None:
        user = _make_user(UserRole.ANALYST)
        assert has_permission(user, Permission.MANAGE_ALERTS)
        assert not has_permission(user, Permission.MANAGE_NETWORKS)

    def test_operator_can_manage_networks_and_alerts(self) -> None:
        user = _make_user(UserRole.OPERATOR)
        assert has_permission(user, Permission.MANAGE_NETWORKS)
        assert has_permission(user, Permission.MANAGE_ALERTS)
        assert not has_permission(user, Permission.MANAGE_USERS)


class TestGetRoleInfo:
    """Test the role info endpoint helper."""

    def test_returns_all_four_roles(self) -> None:
        info = get_role_info()
        names = [r["name"] for r in info]
        assert "admin" in names
        assert "operator" in names
        assert "analyst" in names
        assert "viewer" in names

    def test_each_role_has_description(self) -> None:
        for role in get_role_info():
            assert "description" in role
            assert len(role["description"]) > 10

    def test_each_role_has_permissions_list(self) -> None:
        for role in get_role_info():
            assert "permissions" in role
            assert isinstance(role["permissions"], list)
            assert len(role["permissions"]) > 0

    def test_permissions_are_sorted(self) -> None:
        for role in get_role_info():
            perms = role["permissions"]
            assert perms == sorted(perms)
