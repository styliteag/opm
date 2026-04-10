"""Tests for the GVM library service and router."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scanner import Scanner
from app.services import gvm_library as library_service
from app.services import gvm_metadata as metadata_service
from app.services.gvm_library import GvmLibraryValidationError

# --- Fixture helpers --------------------------------------------------


def _scan_config_xml(name: str, comment: str = "") -> bytes:
    """Return a minimal valid GVM scan config export XML."""
    return (
        f'<get_configs_response status="200" status_text="OK">'
        f'<config id="deadbeef-c001-40d5-8e3f-22fd18816c89">'
        f"<owner><name>admin</name></owner>"
        f"<name>{name}</name>"
        f"<comment>{comment}</comment>"
        f"<type>0</type>"
        f"</config>"
        f"</get_configs_response>"
    ).encode("utf-8")


def _port_list_xml(name: str) -> bytes:
    return (
        f'<get_port_lists_response status="200" status_text="OK">'
        f'<port_list id="feedface-aaaa-bbbb-cccc-222222222222">'
        f"<name>{name}</name>"
        f"<comment/>"
        f"</port_list>"
        f"</get_port_lists_response>"
    ).encode("utf-8")


# --- Upload validation ------------------------------------------------


@pytest.mark.asyncio
async def test_upload_scan_config_extracts_inner_name(db_session: AsyncSession) -> None:
    xml = _scan_config_xml("My Custom Deep Scan")
    entry = await library_service.upsert_entry(
        db_session,
        kind="scan_config",
        xml_bytes=xml,
        uploaded_by_user_id=None,
    )
    assert entry.name == "My Custom Deep Scan"
    assert entry.kind == "scan_config"
    assert entry.xml_hash is not None
    assert len(entry.xml_hash) == 64  # sha256 hex


@pytest.mark.asyncio
async def test_upload_rejects_malformed_xml(db_session: AsyncSession) -> None:
    with pytest.raises(GvmLibraryValidationError, match="Malformed"):
        await library_service.upsert_entry(
            db_session,
            kind="scan_config",
            xml_bytes=b"<not-closed",
            uploaded_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_upload_rejects_wrong_root_element(db_session: AsyncSession) -> None:
    # Port list XML uploaded under scan_config kind → reject
    with pytest.raises(GvmLibraryValidationError, match="Expected root element"):
        await library_service.upsert_entry(
            db_session,
            kind="scan_config",
            xml_bytes=_port_list_xml("Something"),
            uploaded_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_upload_rejects_builtin_names(db_session: AsyncSession) -> None:
    with pytest.raises(GvmLibraryValidationError, match="reserved GVM built-in"):
        await library_service.upsert_entry(
            db_session,
            kind="scan_config",
            xml_bytes=_scan_config_xml("Full and fast"),
            uploaded_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_upload_rejects_oversized_blob(db_session: AsyncSession) -> None:
    oversized = b"<x>" + b"a" * (library_service.MAX_XML_BYTES + 1) + b"</x>"
    with pytest.raises(GvmLibraryValidationError, match="too large"):
        await library_service.upsert_entry(
            db_session,
            kind="scan_config",
            xml_bytes=oversized,
            uploaded_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_upload_same_name_overwrites(db_session: AsyncSession) -> None:
    first = await library_service.upsert_entry(
        db_session,
        kind="scan_config",
        xml_bytes=_scan_config_xml("my-deep", comment="v1"),
        uploaded_by_user_id=None,
    )
    first_id = first.id
    first_hash = first.xml_hash
    second = await library_service.upsert_entry(
        db_session,
        kind="scan_config",
        xml_bytes=_scan_config_xml("my-deep", comment="v2"),
        uploaded_by_user_id=None,
    )
    assert second.id == first_id
    assert second.xml_hash != first_hash


@pytest.mark.asyncio
async def test_port_list_and_scan_config_can_share_name(
    db_session: AsyncSession,
) -> None:
    # UNIQUE(kind, name) — not UNIQUE(name) — so "shared-name" is valid
    cfg = await library_service.upsert_entry(
        db_session,
        kind="scan_config",
        xml_bytes=_scan_config_xml("shared-name"),
        uploaded_by_user_id=None,
    )
    pl = await library_service.upsert_entry(
        db_session,
        kind="port_list",
        xml_bytes=_port_list_xml("shared-name"),
        uploaded_by_user_id=None,
    )
    assert cfg.id != pl.id


# --- Reference resolution for claim ----------------------------------


@pytest.mark.asyncio
async def test_resolve_required_entries_returns_library_matches(
    db_session: AsyncSession, network
) -> None:
    await library_service.upsert_entry(
        db_session,
        kind="scan_config",
        xml_bytes=_scan_config_xml("deep"),
        uploaded_by_user_id=None,
    )
    await library_service.upsert_entry(
        db_session,
        kind="port_list",
        xml_bytes=_port_list_xml("top-1000"),
        uploaded_by_user_id=None,
    )
    network.gvm_scan_config = "deep"
    network.gvm_port_list = "top-1000"
    await db_session.commit()

    required = await library_service.resolve_required_entries(db_session, network)
    kinds = {(e.kind, e.name) for e in required}
    assert kinds == {("scan_config", "deep"), ("port_list", "top-1000")}


@pytest.mark.asyncio
async def test_resolve_required_entries_omits_names_not_in_library(
    db_session: AsyncSession, network
) -> None:
    # "Full and fast" is a GVM built-in — not in library — must NOT be in required
    network.gvm_scan_config = "Full and fast"
    network.gvm_port_list = None
    await db_session.commit()
    required = await library_service.resolve_required_entries(db_session, network)
    assert required == []


# --- Metadata mirror ingest ------------------------------------------


@pytest.mark.asyncio
async def test_ingest_snapshot_replaces_existing_rows(
    db_session: AsyncSession,
) -> None:
    from app.schemas.gvm_library import GvmMetadataSnapshotEntry

    scanner = Scanner(
        name="gvm-scanner-1",
        api_key_hash="x",
        kind="gvm",
    )
    db_session.add(scanner)
    await db_session.commit()

    first_batch = [
        GvmMetadataSnapshotEntry(
            kind="scan_config",
            name="Full and fast",
            gvm_uuid="uuid-1",
            is_builtin=True,
        ),
    ]
    count = await metadata_service.ingest_snapshot(db_session, scanner, first_batch)
    assert count == 1
    assert scanner.gvm_refresh_requested is False
    assert scanner.gvm_synced_at is not None

    second_batch = [
        GvmMetadataSnapshotEntry(
            kind="scan_config",
            name="my-deep",
            gvm_uuid="uuid-2",
            is_builtin=False,
            xml_hash="a" * 64,
        ),
        GvmMetadataSnapshotEntry(
            kind="port_list",
            name="Top 100",
            gvm_uuid="uuid-3",
            is_builtin=True,
        ),
    ]
    count = await metadata_service.ingest_snapshot(db_session, scanner, second_batch)
    assert count == 2

    # Mirror now holds only the second batch (first was wiped)
    rows = await metadata_service.get_mirror_for_scanner(db_session, scanner.id)
    names = sorted(r.name for r in rows)
    assert names == ["Top 100", "my-deep"]
