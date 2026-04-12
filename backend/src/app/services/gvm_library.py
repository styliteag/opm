"""GVM configuration library service — upload validation, CRUD, reference resolution."""

from __future__ import annotations

import hashlib
from typing import Literal
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as DefusedET
from defusedxml.common import DefusedXmlException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gvm_library import GvmLibraryEntry
from app.models.network import Network
from app.schemas.gvm_library import RequiredLibraryEntry
from app.services.gvm_builtins import is_builtin_name

GvmKind = Literal["scan_config", "port_list"]

# ---- Upload validation ---------------------------------------------------

MAX_XML_BYTES = 5 * 1024 * 1024  # 5 MB cap

# Map kind → (expected root element, expected child element holding <name>)
_KIND_SCHEMA: dict[str, tuple[str, str]] = {
    "scan_config": ("get_configs_response", "config"),
    "port_list": ("get_port_lists_response", "port_list"),
}


class GvmLibraryValidationError(Exception):
    """Raised when an uploaded XML fails validation. Message is user-facing."""


def _parse_xml(xml_bytes: bytes) -> Element:
    """Parse XML with defusedxml. Raises GvmLibraryValidationError on failure."""
    try:
        root: Element = DefusedET.fromstring(xml_bytes)
    except DefusedXmlException as exc:
        raise GvmLibraryValidationError(
            f"XML contains disallowed constructs: {exc}"
        ) from exc
    except Exception as exc:  # ET parse errors
        raise GvmLibraryValidationError(f"Malformed XML: {exc}") from exc
    return root


def validate_and_extract_name(xml_bytes: bytes, kind: GvmKind) -> str:
    """Validate uploaded XML and extract the inner ``<name>``.

    Raises :class:`GvmLibraryValidationError` on any validation failure.
    Returns the inner name string on success.
    """
    if len(xml_bytes) == 0:
        raise GvmLibraryValidationError("Empty upload")
    if len(xml_bytes) > MAX_XML_BYTES:
        raise GvmLibraryValidationError(
            f"XML too large: {len(xml_bytes)} bytes (max {MAX_XML_BYTES})"
        )

    root = _parse_xml(xml_bytes)

    expected_root, expected_child = _KIND_SCHEMA[kind]

    if root.tag != expected_root:
        raise GvmLibraryValidationError(
            f"Expected root element <{expected_root}> for kind '{kind}', got <{root.tag}>"
        )

    child = root.find(expected_child)
    if child is None:
        raise GvmLibraryValidationError(
            f"Missing <{expected_child}> element inside <{expected_root}>"
        )

    name_elem = child.find("name")
    if name_elem is None or name_elem.text is None or not name_elem.text.strip():
        raise GvmLibraryValidationError(
            f"<{expected_child}> must contain a non-empty <name>"
        )

    name: str = name_elem.text.strip()

    if len(name) > 100:
        raise GvmLibraryValidationError(
            f"Name too long: {len(name)} chars (max 100)"
        )

    if is_builtin_name(kind, name):
        raise GvmLibraryValidationError(
            f"Cannot upload a library entry with name '{name}' — "
            f"it is a reserved GVM built-in for {kind}"
        )

    return name


def compute_hash(xml_bytes: bytes) -> str:
    """Compute sha256 hex digest of the XML blob."""
    return hashlib.sha256(xml_bytes).hexdigest()


# ---- CRUD ---------------------------------------------------------------


async def list_entries(
    db: AsyncSession, kind: GvmKind | None = None
) -> list[GvmLibraryEntry]:
    """List library entries, optionally filtered by kind."""
    stmt = select(GvmLibraryEntry).order_by(
        GvmLibraryEntry.kind.asc(), GvmLibraryEntry.name.asc()
    )
    if kind is not None:
        stmt = stmt.where(GvmLibraryEntry.kind == kind)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_entry_by_id(
    db: AsyncSession, entry_id: int
) -> GvmLibraryEntry | None:
    """Fetch a library entry by id."""
    result = await db.execute(
        select(GvmLibraryEntry).where(GvmLibraryEntry.id == entry_id)
    )
    return result.scalar_one_or_none()


async def get_entry_by_name(
    db: AsyncSession, kind: GvmKind, name: str
) -> GvmLibraryEntry | None:
    """Fetch a library entry by (kind, name)."""
    result = await db.execute(
        select(GvmLibraryEntry).where(
            and_(GvmLibraryEntry.kind == kind, GvmLibraryEntry.name == name)
        )
    )
    return result.scalar_one_or_none()


async def upsert_entry(
    db: AsyncSession,
    *,
    kind: GvmKind,
    xml_bytes: bytes,
    uploaded_by_user_id: int | None,
) -> GvmLibraryEntry:
    """Validate and upsert a library entry.

    Uploading an XML whose inner ``<name>`` matches an existing row of the
    same kind overwrites the blob and bumps ``xml_hash`` + ``updated_at``.
    """
    name = validate_and_extract_name(xml_bytes, kind)
    xml_text = xml_bytes.decode("utf-8", errors="replace")
    xml_hash = compute_hash(xml_bytes)

    existing = await get_entry_by_name(db, kind, name)
    if existing is not None:
        existing.xml_blob = xml_text
        existing.xml_hash = xml_hash
        await db.flush()
        await db.refresh(existing)
        return existing

    entry = GvmLibraryEntry(
        kind=kind,
        name=name,
        xml_blob=xml_text,
        xml_hash=xml_hash,
        uploaded_by_user_id=uploaded_by_user_id,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def delete_entry(db: AsyncSession, entry: GvmLibraryEntry) -> None:
    """Delete a library entry. Does not touch referencing networks."""
    await db.delete(entry)
    await db.flush()


async def get_referencing_networks(
    db: AsyncSession, kind: GvmKind, name: str
) -> list[Network]:
    """Return networks whose ``gvm_scan_config`` or ``gvm_port_list`` equals ``name``."""
    if kind == "scan_config":
        field = Network.gvm_scan_config
    else:
        field = Network.gvm_port_list
    result = await db.execute(select(Network).where(field == name))
    return list(result.scalars().all())


# ---- Resolution for required library entries on claim ------------------


async def resolve_required_entries(
    db: AsyncSession, network: Network
) -> list[RequiredLibraryEntry]:
    """Return the library entries a scanner must have before running ``network``.

    Looks up ``network.gvm_scan_config`` and ``network.gvm_port_list`` in the
    library table and returns matching entries (name+kind+hash). Names that
    do not exist in the library are silently omitted — the scanner will
    rely on its native mirror for those (resolution step 2).
    """
    needed: list[tuple[GvmKind, str]] = []
    if network.gvm_scan_config:
        needed.append(("scan_config", network.gvm_scan_config))
    if network.gvm_port_list:
        needed.append(("port_list", network.gvm_port_list))

    if not needed:
        return []

    clauses = [
        and_(GvmLibraryEntry.kind == kind, GvmLibraryEntry.name == name)
        for kind, name in needed
    ]
    result = await db.execute(select(GvmLibraryEntry).where(or_(*clauses)))
    entries = result.scalars().all()

    return [
        RequiredLibraryEntry.model_validate(
            {"kind": entry.kind, "name": entry.name, "xml_hash": entry.xml_hash}
        )
        for entry in entries
    ]
