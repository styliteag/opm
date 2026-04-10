"""GVM metadata snapshot: fetch scan configs + port lists, parse OPM hash marker."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any
from xml.etree import ElementTree

_OPM_HASH_MARKER_RE = re.compile(r"\[OPM:hash=([0-9a-f]{64})\]")


def compute_hash(xml_bytes: bytes) -> str:
    """sha256 hex digest of raw XML bytes — must match backend hashing."""
    return hashlib.sha256(xml_bytes).hexdigest()


def parse_opm_hash(comment_text: str | None) -> str | None:
    """Extract the OPM hash marker from a GVM ``<comment>`` element text."""
    if not comment_text:
        return None
    match = _OPM_HASH_MARKER_RE.search(comment_text)
    return match.group(1) if match else None


def inject_opm_hash(xml_bytes: bytes, new_hash: str) -> bytes:
    """Append ``[OPM:hash=<hex>]`` to the ``<comment>`` element of a GVM XML.

    Preserves existing comment text. If no ``<comment>`` element exists, one
    is added as the second child of the inner ``<config>`` / ``<port_list>``.
    Returns the modified XML bytes suitable for ``gmp.import_config`` /
    ``gmp.import_port_list``.
    """
    text = xml_bytes.decode("utf-8", errors="replace")
    tree = ElementTree.fromstring(text)

    # Find the inner element (config or port_list) — it's the first child
    inner = None
    for child in list(tree):
        if child.tag in {"config", "port_list"}:
            inner = child
            break
    if inner is None:
        raise ValueError("XML has no <config> or <port_list> element to tag")

    comment = inner.find("comment")
    marker = f"[OPM:hash={new_hash}]"
    if comment is None:
        comment = ElementTree.SubElement(inner, "comment")
        comment.text = marker
    else:
        existing = comment.text or ""
        # Strip any pre-existing marker so we don't stack them
        stripped = _OPM_HASH_MARKER_RE.sub("", existing).rstrip()
        comment.text = (stripped + "\n" + marker) if stripped else marker

    return ElementTree.tostring(tree, encoding="utf-8")


def _parse_entries(
    xml_text: str,
    outer_tag: str,
    kind: str,
) -> list[dict[str, Any]]:
    """Parse a GVM get_*_response XML into snapshot entry dicts."""
    entries: list[dict[str, Any]] = []
    tree = ElementTree.fromstring(xml_text)
    for elem in tree.findall(f".//{outer_tag}"):
        name_elem = elem.find("name")
        comment_elem = elem.find("comment")
        predefined_elem = elem.find("predefined")

        gvm_uuid = elem.get("id", "")
        name = (name_elem.text or "") if name_elem is not None else ""
        if not gvm_uuid or not name:
            continue

        is_builtin = False
        if predefined_elem is not None and predefined_elem.text == "1":
            is_builtin = True

        xml_hash = parse_opm_hash(
            comment_elem.text if comment_elem is not None else None
        )

        extra: dict[str, Any] = {}
        # Scan config family/nvt counts (scan_config-specific)
        family_count_elem = elem.find("family_count")
        nvt_count_elem = elem.find("nvt_count")
        if family_count_elem is not None and family_count_elem.text:
            try:
                extra["family_count"] = int(family_count_elem.text)
            except ValueError:
                pass
        if nvt_count_elem is not None and nvt_count_elem.text:
            try:
                extra["nvt_count"] = int(nvt_count_elem.text)
            except ValueError:
                pass
        # Port list count (port_list-specific)
        port_count_elem = elem.find("port_count/all")
        if port_count_elem is not None and port_count_elem.text:
            try:
                extra["port_count"] = int(port_count_elem.text)
            except ValueError:
                pass

        entries.append(
            {
                "kind": kind,
                "name": name,
                "gvm_uuid": gvm_uuid,
                "is_builtin": is_builtin,
                "xml_hash": xml_hash,
                "extra": extra or None,
            }
        )
    return entries


def fetch_snapshot(gmp: Any, logger: logging.Logger) -> list[dict[str, Any]]:
    """Fetch scan configs + port lists from a live GVM instance.

    Returns a list of snapshot entry dicts suitable for POST
    ``/api/scanner/gvm-metadata``.
    """
    entries: list[dict[str, Any]] = []

    try:
        configs_resp = gmp.get_scan_configs()
        entries.extend(_parse_entries(str(configs_resp), "config", "scan_config"))
    except Exception:
        logger.warning("fetch_snapshot: failed to read scan configs", exc_info=True)

    try:
        port_lists_resp = gmp.get_port_lists()
        entries.extend(_parse_entries(str(port_lists_resp), "port_list", "port_list"))
    except Exception:
        logger.warning("fetch_snapshot: failed to read port lists", exc_info=True)

    logger.info("Fetched GVM metadata snapshot: %d entries", len(entries))
    return entries
