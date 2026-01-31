"""Tests for scan service and router."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.models.user import User
from app.services.scans import (
    cancel_scan,
    create_manual_scan,
    delete_scan,
    get_all_scans,
    get_latest_scans_by_network,
    get_scan_by_id,
    get_scan_with_ports,
    get_scans_by_network_id,
    set_scan_hidden,
)
from conftest import NetworkFactory, ScannerFactory


class TestScanService:
    """Tests for scan service functions."""

    async def test_create_manual_scan(
        self, db_session: AsyncSession, network: Network
    ):
        """Create manual scan should create scan with planned status."""
        scan = await create_manual_scan(db_session, network)

        assert scan.id is not None
        assert scan.network_id == network.id
        assert scan.scanner_id == network.scanner_id
        assert scan.status == ScanStatus.PLANNED
        assert scan.trigger_type == TriggerType.MANUAL

    async def test_get_scan_by_id_exists(
        self, db_session: AsyncSession, network: Network
    ):
        """Get scan by ID should return scan when exists."""
        scan = await create_manual_scan(db_session, network)
        await db_session.commit()

        result = await get_scan_by_id(db_session, scan.id)

        assert result is not None
        assert result.id == scan.id

    async def test_get_scan_by_id_not_exists(self, db_session: AsyncSession):
        """Get scan by ID should return None when not exists."""
        result = await get_scan_by_id(db_session, 99999)
        assert result is None

    async def test_get_scan_with_ports(
        self, db_session: AsyncSession, network: Network
    ):
        """Get scan with ports should load related data."""
        scan = await create_manual_scan(db_session, network)
        await db_session.commit()

        result = await get_scan_with_ports(db_session, scan.id)

        assert result is not None
        assert result.id == scan.id
        # open_ports relationship should be loaded
        assert hasattr(result, 'open_ports')

    async def test_get_scans_by_network_id(
        self, db_session: AsyncSession, network: Network
    ):
        """Get scans by network ID should return scans for that network."""
        scan1 = await create_manual_scan(db_session, network)
        scan2 = await create_manual_scan(db_session, network)
        await db_session.commit()

        result = await get_scans_by_network_id(db_session, network.id)

        assert len(result) == 2
        scan_ids = [s[0].id for s in result]
        assert scan1.id in scan_ids
        assert scan2.id in scan_ids

    async def test_get_scans_by_network_id_with_pagination(
        self, db_session: AsyncSession, network: Network
    ):
        """Get scans by network ID should respect pagination."""
        for _ in range(5):
            await create_manual_scan(db_session, network)
        await db_session.commit()

        result = await get_scans_by_network_id(db_session, network.id, offset=0, limit=2)

        assert len(result) == 2

    async def test_cancel_scan(
        self, db_session: AsyncSession, network: Network, admin_user: User
    ):
        """Cancel scan should update status and set cancellation metadata."""
        scan = await create_manual_scan(db_session, network)
        scan.status = ScanStatus.RUNNING
        await db_session.commit()

        cancelled = await cancel_scan(db_session, scan, admin_user.id)

        assert cancelled.status == ScanStatus.CANCELLED
        assert cancelled.cancelled_at is not None
        assert cancelled.cancelled_by == admin_user.id

    async def test_set_scan_hidden(
        self, db_session: AsyncSession, network: Network
    ):
        """Set scan hidden should update the hidden flag."""
        scan = await create_manual_scan(db_session, network)
        await db_session.commit()
        assert scan.hidden is False

        updated = await set_scan_hidden(db_session, scan, True)

        assert updated.hidden is True

    async def test_delete_scan(
        self, db_session: AsyncSession, network: Network
    ):
        """Delete scan should remove scan from database."""
        scan = await create_manual_scan(db_session, network)
        await db_session.commit()
        scan_id = scan.id

        await delete_scan(db_session, scan)
        await db_session.commit()

        result = await get_scan_by_id(db_session, scan_id)
        assert result is None

    async def test_get_all_scans(
        self,
        db_session: AsyncSession,
        scanner_factory: ScannerFactory,
        network_factory: NetworkFactory,
    ):
        """Get all scans should return scans across networks."""
        scanner = await scanner_factory.create()
        net1 = await network_factory.create(scanner, cidr="10.0.0.0/24")
        net2 = await network_factory.create(scanner, cidr="10.0.1.0/24")

        await create_manual_scan(db_session, net1)
        await create_manual_scan(db_session, net2)
        await db_session.commit()

        result = await get_all_scans(db_session)

        assert len(result) == 2

    async def test_get_all_scans_filter_by_network(
        self,
        db_session: AsyncSession,
        scanner_factory: ScannerFactory,
        network_factory: NetworkFactory,
    ):
        """Get all scans should filter by network_id when provided."""
        scanner = await scanner_factory.create()
        net1 = await network_factory.create(scanner, cidr="10.0.0.0/24")
        net2 = await network_factory.create(scanner, cidr="10.0.1.0/24")

        await create_manual_scan(db_session, net1)
        await create_manual_scan(db_session, net1)
        await create_manual_scan(db_session, net2)
        await db_session.commit()

        result = await get_all_scans(db_session, network_id=net1.id)

        assert len(result) == 2
        for scan, _ in result:
            assert scan.network_id == net1.id

    async def test_get_all_scans_exclude_hidden(
        self, db_session: AsyncSession, network: Network
    ):
        """Get all scans should exclude hidden scans by default."""
        visible_scan = await create_manual_scan(db_session, network)
        hidden_scan = await create_manual_scan(db_session, network)
        hidden_scan.hidden = True
        await db_session.commit()

        result = await get_all_scans(db_session, include_hidden=False)

        scan_ids = [s[0].id for s in result]
        assert visible_scan.id in scan_ids
        assert hidden_scan.id not in scan_ids

    async def test_get_latest_scans_by_network(
        self,
        db_session: AsyncSession,
        scanner_factory: ScannerFactory,
        network_factory: NetworkFactory,
    ):
        """Get latest scans by network should return latest completed scan per network."""
        scanner = await scanner_factory.create()
        net1 = await network_factory.create(scanner, cidr="10.0.0.0/24")
        net2 = await network_factory.create(scanner, cidr="10.0.1.0/24")

        # Create scans for net1 - only completed ones should be considered
        scan1 = await create_manual_scan(db_session, net1)
        scan1.status = ScanStatus.COMPLETED
        scan1.completed_at = datetime.now(timezone.utc)

        scan2 = await create_manual_scan(db_session, net1)
        scan2.status = ScanStatus.COMPLETED
        scan2.completed_at = datetime.now(timezone.utc)

        # Create a planned scan that should be ignored
        await create_manual_scan(db_session, net1)

        # Create scan for net2
        scan3 = await create_manual_scan(db_session, net2)
        scan3.status = ScanStatus.COMPLETED
        scan3.completed_at = datetime.now(timezone.utc)

        await db_session.commit()

        result = await get_latest_scans_by_network(db_session)

        # Should have entries for both networks
        assert net1.id in result
        assert net2.id in result

        # Should return the latest scan (highest ID) for net1
        latest_net1 = result[net1.id]
        assert latest_net1 is not None
        assert latest_net1[0].id == scan2.id


class TestScanRouter:
    """Tests for scan router endpoints."""

    async def test_get_all_scans(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Get all scans should return scan list."""
        response = await client.get("/api/scans", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "scans" in data

    async def test_get_scan_detail(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Get scan detail should return scan with ports."""
        network, scan = network_with_scan

        response = await client.get(f"/api/scans/{scan.id}", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == scan.id
        assert "open_ports" in data

    async def test_get_scan_detail_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Get scan detail should return 404 for non-existent scan."""
        response = await client.get("/api/scans/99999", headers=admin_headers)

        assert response.status_code == 404

    async def test_cancel_scan_not_running(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Cancel scan should return 409 if scan is not running."""
        network, scan = network_with_scan  # Status is COMPLETED

        response = await client.post(
            f"/api/scans/{scan.id}/cancel", headers=admin_headers
        )

        assert response.status_code == 409

    async def test_update_scan_visibility(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Update scan visibility should toggle hidden flag."""
        network, scan = network_with_scan

        response = await client.patch(
            f"/api/scans/{scan.id}/visibility",
            headers=admin_headers,
            json={"hidden": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["hidden"] is True

    async def test_delete_scan(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Delete scan should remove scan."""
        network, scan = network_with_scan

        response = await client.delete(
            f"/api/scans/{scan.id}", headers=admin_headers
        )

        assert response.status_code == 204

    async def test_get_latest_scans_by_network(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """Get latest scans by network endpoint should return grouped scans."""
        response = await client.get(
            "/api/scans/latest-by-network", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "latest_scans" in data

    async def test_viewer_can_access_scans(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        viewer_headers: dict,
    ):
        """Viewer should be able to access scan endpoints."""
        network, scan = network_with_scan

        response = await client.get(f"/api/scans/{scan.id}", headers=viewer_headers)

        assert response.status_code == 200

    async def test_viewer_cannot_delete_scan(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        viewer_headers: dict,
    ):
        """Viewer should not be able to delete scans."""
        network, scan = network_with_scan

        response = await client.delete(
            f"/api/scans/{scan.id}", headers=viewer_headers
        )

        assert response.status_code == 403
