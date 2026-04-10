"""Deploy library-managed scan configs + port lists into a GVM scanner.

Called from :func:`GreenboneScanner.run_scan` immediately after GMP
authentication, before any target/task is created. Idempotent: for each
required entry, looks at the scanner's current state and imports only if
missing or drifted (comment-embedded OPM hash doesn't match).
"""

from __future__ import annotations

import logging
from typing import Any
from xml.etree import ElementTree

from src.client import ScannerClient
from src.scanners.greenbone_metadata import inject_opm_hash, parse_opm_hash


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


def _install_entry(
    gmp: Any,
    kind: str,
    name: str,
    required_hash: str,
    client: ScannerClient,
    logger: logging.Logger,
    existing_uuid: str | None,
) -> None:
    """Delete (if drifted) and import a single library entry."""
    if existing_uuid is not None:
        logger.info(
            "Deleting drifted GVM %s '%s' (%s) before reimport",
            kind,
            name,
            existing_uuid,
        )
        try:
            if kind == "scan_config":
                gmp.delete_config(config_id=existing_uuid, ultimate=True)
            else:
                gmp.delete_port_list(port_list_id=existing_uuid, ultimate=True)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Cannot update GVM {kind} '{name}': another scan on this "
                f"scanner may still be using the previous version. "
                f"Retry shortly. (GVM error: {exc})"
            ) from exc

    logger.info("Fetching GVM %s XML for '%s' from OPM library", kind, name)
    xml_bytes = client.get_gvm_library_xml(kind, name)
    tagged = inject_opm_hash(xml_bytes, required_hash)

    logger.info("Importing GVM %s '%s' (hash=%s)", kind, name, required_hash[:8])
    if kind == "scan_config":
        gmp.import_config(tagged.decode("utf-8"))
    else:
        gmp.import_port_list(tagged.decode("utf-8"))


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

    # Split by kind so we only hit get_scan_configs / get_port_lists once
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
                _install_entry(
                    gmp,
                    "scan_config",
                    name,
                    required_hash,
                    client,
                    logger,
                    existing_uuid,
                )
            else:
                _install_entry(
                    gmp,
                    "scan_config",
                    name,
                    required_hash,
                    client,
                    logger,
                    None,
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
                _install_entry(
                    gmp,
                    "port_list",
                    name,
                    required_hash,
                    client,
                    logger,
                    existing_uuid,
                )
            else:
                _install_entry(
                    gmp,
                    "port_list",
                    name,
                    required_hash,
                    client,
                    logger,
                    None,
                )
