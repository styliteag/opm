"""Deploy library-managed scan configs + port lists into a GVM scanner.

Called from :func:`GreenboneScanner.run_scan` immediately after GMP
authentication, before any target/task is created. Idempotent: for each
required entry, looks at the scanner's current state and imports only if
missing or drifted (comment-embedded OPM hash doesn't match).

GMP v227 notes:
    * Scan configs use ``gmp.import_scan_config(xml)`` /
      ``gmp.delete_scan_config(config_id=..., ultimate=True)``.
    * Port lists have no import wrapper. We parse ``<port_ranges>`` from
      the exported XML into the ``"T:1-1024,U:1-100"`` string format and
      call ``gmp.create_port_list(name, port_range, comment)``.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from xml.etree import ElementTree

from src.client import ScannerClient
from src.scanners.greenbone_metadata import parse_opm_hash

_OPM_HASH_MARKER_RE = re.compile(r"\[OPM:hash=[0-9a-f]{64}\]")


def _find_entry(xml_text: str, tag: str, name: str) -> tuple[str, str | None] | None:
    """Return (uuid, comment_text) for a named entry in a get_*_response XML."""
    tree = ElementTree.fromstring(xml_text)
    for elem in tree.findall(f".//{tag}"):
        name_elem = elem.find("name")
        if name_elem is None or name_elem.text != name:
            continue
        comment_elem = elem.find("comment")
        comment_text = (
            comment_elem.text if comment_elem is not None else None
        )
        return elem.get("id", ""), comment_text
    return None


def _inject_hash_into_scan_config_xml(xml_bytes: bytes, new_hash: str) -> str:
    """Append [OPM:hash=...] to the inner <config><comment> for scan configs."""
    from src.scanners.greenbone_metadata import inject_opm_hash

    return inject_opm_hash(xml_bytes, new_hash).decode("utf-8")


def _parse_port_list_xml(xml_bytes: bytes) -> tuple[str, str, str]:
    """Parse an exported <get_port_lists_response> into (name, port_range, comment).

    ``port_range`` is returned in the ``"T:1-1024,U:1-100"`` format expected
    by ``gmp.create_port_list``. The ``comment`` text is returned stripped
    of any existing OPM hash marker — the caller appends a fresh one.
    """
    tree = ElementTree.fromstring(xml_bytes)
    port_list = tree.find("port_list")
    if port_list is None:
        raise ValueError("Missing <port_list> element in port list XML")

    name_elem = port_list.find("name")
    if name_elem is None or not name_elem.text:
        raise ValueError("Port list XML has no <name>")
    name = name_elem.text.strip()

    comment_elem = port_list.find("comment")
    comment_text = (comment_elem.text or "") if comment_elem is not None else ""
    # Strip any pre-existing OPM hash marker; caller appends a fresh one
    comment_text = _OPM_HASH_MARKER_RE.sub("", comment_text).strip()

    # Parse <port_ranges><port_range><start>N</start><end>M</end><type>tcp</type>...
    ranges: list[str] = []
    for pr in port_list.findall("port_ranges/port_range"):
        start = pr.findtext("start", "").strip()
        end = pr.findtext("end", "").strip()
        ptype = pr.findtext("type", "tcp").strip().lower()
        if not start:
            continue
        prefix = "T" if ptype == "tcp" else "U"
        if end and end != start:
            ranges.append(f"{prefix}:{start}-{end}")
        else:
            ranges.append(f"{prefix}:{start}")
    if not ranges:
        raise ValueError(
            f"Port list '{name}' has no <port_range> children — cannot import"
        )

    return name, ",".join(ranges), comment_text


def _install_scan_config(
    gmp: Any,
    name: str,
    required_hash: str,
    client: ScannerClient,
    logger: logging.Logger,
    existing_uuid: str | None,
) -> None:
    """Delete (if drifted) and import a single scan config library entry."""
    if existing_uuid is not None:
        logger.info(
            "Deleting drifted GVM scan_config '%s' (%s) before reimport",
            name,
            existing_uuid,
        )
        try:
            gmp.delete_scan_config(config_id=existing_uuid, ultimate=True)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Cannot update GVM scan_config '{name}': another scan on "
                f"this scanner may still be using the previous version. "
                f"Retry shortly. (GVM error: {exc})"
            ) from exc

    logger.info("Fetching GVM scan_config XML for '%s' from OPM library", name)
    xml_bytes = client.get_gvm_library_xml("scan_config", name)
    tagged = _inject_hash_into_scan_config_xml(xml_bytes, required_hash)

    logger.info("Importing GVM scan_config '%s' (hash=%s)", name, required_hash[:8])
    gmp.import_scan_config(tagged)


def _install_port_list(
    gmp: Any,
    name: str,
    required_hash: str,
    client: ScannerClient,
    logger: logging.Logger,
    existing_uuid: str | None,
) -> None:
    """Delete (if drifted) and re-create a single port list library entry.

    Unlike scan configs, GMP has no import wrapper — we parse the structured
    port ranges and use ``create_port_list``. The OPM hash marker is stored
    in the ``comment`` field.
    """
    if existing_uuid is not None:
        logger.info(
            "Deleting drifted GVM port_list '%s' (%s) before recreate",
            name,
            existing_uuid,
        )
        try:
            gmp.delete_port_list(port_list_id=existing_uuid, ultimate=True)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Cannot update GVM port_list '{name}': another scan on "
                f"this scanner may still be using the previous version. "
                f"Retry shortly. (GVM error: {exc})"
            ) from exc

    logger.info("Fetching GVM port_list XML for '%s' from OPM library", name)
    xml_bytes = client.get_gvm_library_xml("port_list", name)
    parsed_name, port_range, existing_comment = _parse_port_list_xml(xml_bytes)
    marker = f"[OPM:hash={required_hash}]"
    comment = (
        f"{existing_comment}\n{marker}" if existing_comment else marker
    )

    logger.info(
        "Creating GVM port_list '%s' (hash=%s, %d ranges)",
        parsed_name,
        required_hash[:8],
        len(port_range.split(",")),
    )
    gmp.create_port_list(name=parsed_name, port_range=port_range, comment=comment)


def ensure_required(
    gmp: Any,
    required: list[dict[str, str]],
    client: ScannerClient,
    logger: logging.Logger,
) -> None:
    """For each required library entry, import or update it if needed.

    ``required`` items are ``{"kind": ..., "name": ..., "xml_hash": ...}``
    dicts. We read the scanner's current state once per kind, compare by
    name+hash, and only re-import entries that are missing or drifted.
    """
    if not required:
        return

    want_scan_configs = [r for r in required if r["kind"] == "scan_config"]
    want_port_lists = [r for r in required if r["kind"] == "port_list"]

    if want_scan_configs:
        resp_xml = str(gmp.get_scan_configs())
        for req in want_scan_configs:
            name = req["name"]
            required_hash = req["xml_hash"]
            existing = _find_entry(resp_xml, "config", name)
            if existing is not None:
                existing_uuid, comment = existing
                installed_hash = parse_opm_hash(comment)
                if installed_hash == required_hash:
                    logger.info(
                        "GVM scan_config '%s' already installed (hash=%s), skipping",
                        name,
                        required_hash[:8],
                    )
                    continue
                _install_scan_config(
                    gmp, name, required_hash, client, logger, existing_uuid
                )
            else:
                _install_scan_config(
                    gmp, name, required_hash, client, logger, None
                )

    if want_port_lists:
        resp_xml = str(gmp.get_port_lists())
        for req in want_port_lists:
            name = req["name"]
            required_hash = req["xml_hash"]
            existing = _find_entry(resp_xml, "port_list", name)
            if existing is not None:
                existing_uuid, comment = existing
                installed_hash = parse_opm_hash(comment)
                if installed_hash == required_hash:
                    logger.info(
                        "GVM port_list '%s' already installed (hash=%s), skipping",
                        name,
                        required_hash[:8],
                    )
                    continue
                _install_port_list(
                    gmp, name, required_hash, client, logger, existing_uuid
                )
            else:
                _install_port_list(
                    gmp, name, required_hash, client, logger, None
                )
