"""Tests for network service and router."""

from conftest import NetworkFactory, ScannerFactory
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.scanner import Scanner
from app.models.user import User
from app.services.networks import (
    create_network,
    delete_network,
    get_all_networks,
    get_network_by_id,
    get_network_by_name,
    get_networks_by_scanner_id,
    update_network,
)


class TestNetworkService:
    """Tests for network service functions."""

    async def test_get_all_networks_empty(self, db_session: AsyncSession):
        """Get all networks should return empty list when no networks exist."""
        result = await get_all_networks(db_session)
        assert result == []

    async def test_get_all_networks_with_networks(
        self,
        db_session: AsyncSession,
        scanner: Scanner,
        network_factory: NetworkFactory,
    ):
        """Get all networks should return all networks."""
        await network_factory.create(scanner, name="Network 1", cidr="10.0.0.0/24")
        await network_factory.create(scanner, name="Network 2", cidr="10.0.1.0/24")

        result = await get_all_networks(db_session)

        assert len(result) == 2
        names = [n.name for n in result]
        assert "Network 1" in names
        assert "Network 2" in names

    async def test_get_network_by_id_exists(
        self, db_session: AsyncSession, network: Network
    ):
        """Get network by ID should return network when exists."""
        result = await get_network_by_id(db_session, network.id)

        assert result is not None
        assert result.id == network.id
        assert result.name == network.name

    async def test_get_network_by_id_not_exists(self, db_session: AsyncSession):
        """Get network by ID should return None when not exists."""
        result = await get_network_by_id(db_session, 99999)
        assert result is None

    async def test_get_network_by_name_exists(
        self, db_session: AsyncSession, network: Network
    ):
        """Get network by name should return network when exists."""
        result = await get_network_by_name(db_session, network.name)

        assert result is not None
        assert result.name == network.name

    async def test_get_network_by_name_not_exists(self, db_session: AsyncSession):
        """Get network by name should return None when not exists."""
        result = await get_network_by_name(db_session, "Nonexistent Network")
        assert result is None

    async def test_get_networks_by_scanner_id(
        self,
        db_session: AsyncSession,
        scanner_factory: ScannerFactory,
        network_factory: NetworkFactory,
    ):
        """Get networks by scanner ID should return only networks for that scanner."""
        scanner1 = await scanner_factory.create(name="Scanner 1")
        scanner2 = await scanner_factory.create(name="Scanner 2")

        await network_factory.create(scanner1, name="Net 1", cidr="10.0.0.0/24")
        await network_factory.create(scanner1, name="Net 2", cidr="10.0.1.0/24")
        await network_factory.create(scanner2, name="Net 3", cidr="10.0.2.0/24")

        result = await get_networks_by_scanner_id(db_session, scanner1.id)

        assert len(result) == 2
        for net in result:
            assert net.scanner_id == scanner1.id

    async def test_create_network(self, db_session: AsyncSession, scanner: Scanner):
        """Create network should create network with correct attributes."""
        network = await create_network(
            db_session,
            name="New Network",
            cidr="172.16.0.0/16",
            port_spec="22,80,443",
            scanner_id=scanner.id,
            scan_schedule="0 */6 * * *",
            scan_rate=1000,
        )

        assert network.id is not None
        assert network.name == "New Network"
        assert network.cidr == "172.16.0.0/16"
        assert network.port_spec == "22,80,443"
        assert network.scanner_id == scanner.id
        assert network.scan_schedule == "0 */6 * * *"
        assert network.scan_rate == 1000

    async def test_create_network_with_defaults(
        self, db_session: AsyncSession, scanner: Scanner
    ):
        """Create network should use default values."""
        network = await create_network(
            db_session,
            name="Default Network",
            cidr="192.168.0.0/24",
            port_spec="80",
            scanner_id=scanner.id,
        )

        assert network.scanner_type == "masscan"
        assert network.scan_protocol == "tcp"
        assert network.host_discovery_enabled is True

    async def test_update_network_name(
        self, db_session: AsyncSession, network: Network
    ):
        """Update network should update name."""
        updated = await update_network(db_session, network, name="Updated Name")

        assert updated.name == "Updated Name"

    async def test_update_network_cidr(
        self, db_session: AsyncSession, network: Network
    ):
        """Update network should update CIDR."""
        updated = await update_network(db_session, network, cidr="10.10.0.0/16")

        assert updated.cidr == "10.10.0.0/16"

    async def test_update_network_clear_schedule(
        self, db_session: AsyncSession, scanner: Scanner
    ):
        """Update network should clear schedule when requested."""
        network = await create_network(
            db_session,
            name="Scheduled Net",
            cidr="10.0.0.0/24",
            port_spec="80",
            scanner_id=scanner.id,
            scan_schedule="0 0 * * *",
        )
        await db_session.commit()

        updated = await update_network(
            db_session, network, clear_schedule=True
        )

        assert updated.scan_schedule is None

    async def test_delete_network(
        self, db_session: AsyncSession, network_factory: NetworkFactory, scanner: Scanner
    ):
        """Delete network should remove network from database."""
        network = await network_factory.create(
            scanner, name="To Delete", cidr="10.99.0.0/24"
        )
        network_id = network.id

        await delete_network(db_session, network)
        await db_session.commit()

        result = await get_network_by_id(db_session, network_id)
        assert result is None

    async def test_network_is_ipv6_false(
        self, db_session: AsyncSession, scanner: Scanner
    ):
        """Network is_ipv6 should return False for IPv4 CIDR."""
        network = await create_network(
            db_session,
            name="IPv4 Net",
            cidr="192.168.1.0/24",
            port_spec="80",
            scanner_id=scanner.id,
        )

        assert network.is_ipv6 is False

    async def test_network_is_ipv6_true(
        self, db_session: AsyncSession, scanner: Scanner
    ):
        """Network is_ipv6 should return True for IPv6 CIDR."""
        network = await create_network(
            db_session,
            name="IPv6 Net",
            cidr="2001:db8::/32",
            port_spec="80",
            scanner_id=scanner.id,
        )

        assert network.is_ipv6 is True


class TestNetworkRouter:
    """Tests for network router endpoints."""

    async def test_list_networks_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        network: Network,
        admin_headers: dict,
    ):
        """List networks should return all networks for admin."""
        response = await client.get("/api/networks", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "networks" in data
        assert len(data["networks"]) >= 1

    async def test_list_networks_as_viewer(
        self, client: AsyncClient, viewer_user: User, viewer_headers: dict
    ):
        """List networks should return 403 for viewer."""
        response = await client.get("/api/networks", headers=viewer_headers)

        assert response.status_code == 403

    async def test_create_network_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        scanner: Scanner,
        admin_headers: dict,
    ):
        """Create network should work for admin."""
        response = await client.post(
            "/api/networks",
            headers=admin_headers,
            json={
                "name": "API Network",
                "cidr": "10.20.0.0/24",
                "port_spec": "22,80,443",
                "scanner_id": scanner.id,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "API Network"
        assert data["cidr"] == "10.20.0.0/24"

    async def test_create_network_duplicate_name(
        self,
        client: AsyncClient,
        admin_user: User,
        scanner: Scanner,
        network: Network,
        admin_headers: dict,
    ):
        """Create network should return 400 for duplicate name."""
        response = await client.post(
            "/api/networks",
            headers=admin_headers,
            json={
                "name": network.name,  # Duplicate
                "cidr": "10.30.0.0/24",
                "port_spec": "80",
                "scanner_id": scanner.id,
            },
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    async def test_create_network_invalid_scanner(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Create network should return 400 for non-existent scanner."""
        response = await client.post(
            "/api/networks",
            headers=admin_headers,
            json={
                "name": "Invalid Scanner Net",
                "cidr": "10.40.0.0/24",
                "port_spec": "80",
                "scanner_id": 99999,
            },
        )

        assert response.status_code == 400
        assert "Scanner not found" in response.json()["detail"]

    async def test_get_network_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        network: Network,
        admin_headers: dict,
    ):
        """Get network should return network details for admin."""
        response = await client.get(
            f"/api/networks/{network.id}", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == network.id
        assert data["name"] == network.name

    async def test_get_network_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Get network should return 404 for non-existent network."""
        response = await client.get("/api/networks/99999", headers=admin_headers)

        assert response.status_code == 404

    async def test_update_network_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        network: Network,
        admin_headers: dict,
    ):
        """Update network should work for admin."""
        response = await client.put(
            f"/api/networks/{network.id}",
            headers=admin_headers,
            json={"name": "Updated Network Name"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Network Name"

    async def test_delete_network_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        network: Network,
        admin_headers: dict,
    ):
        """Delete network should work for admin."""
        response = await client.delete(
            f"/api/networks/{network.id}", headers=admin_headers
        )

        assert response.status_code == 204

    async def test_trigger_scan(
        self,
        client: AsyncClient,
        admin_user: User,
        network: Network,
        admin_headers: dict,
    ):
        """Trigger scan should create a planned scan."""
        response = await client.post(
            f"/api/networks/{network.id}/scan", headers=admin_headers
        )

        assert response.status_code == 201
        data = response.json()
        assert data["network_id"] == network.id
        assert "scan_id" in data

    async def test_list_network_scans(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        admin_headers: dict,
    ):
        """List network scans should return scan history."""
        network, scan = network_with_scan

        response = await client.get(
            f"/api/networks/{network.id}/scans", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "scans" in data
        assert len(data["scans"]) >= 1
