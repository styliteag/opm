"""Port range parsing and matching utilities for alert generation."""

from typing import Iterable

from app.models.port_rule import PortRule

PortKey = tuple[str, int]


def _parse_port_range(value: str) -> tuple[int, int] | None:
    """Parse a port or port range string into a (start, end) tuple."""
    if not value:
        return None

    cleaned = value.strip()
    if "-" in cleaned:
        parts = cleaned.split("-", maxsplit=1)
        try:
            start = int(parts[0])
            end = int(parts[1])
        except ValueError:
            return None
        if start > end:
            return None
        return start, end

    try:
        port = int(cleaned)
    except ValueError:
        return None
    return port, port


def _build_port_ranges(rules: Iterable[PortRule]) -> list[tuple[int, int]]:
    """Build a list of inclusive port ranges from rules."""
    ranges: list[tuple[int, int]] = []
    for rule in rules:
        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue
        ranges.append(parsed)
    return ranges


def _build_ip_rule_ranges(
    rules: Iterable[PortRule],
) -> dict[str, list[tuple[int, int]]]:
    """Build a map of IP-specific port ranges from rules."""
    ranges_by_ip: dict[str, list[tuple[int, int]]] = {}
    for rule in rules:
        if not rule.ip:
            continue
        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue
        ranges_by_ip.setdefault(rule.ip, []).append(parsed)
    return ranges_by_ip


def _combine_ranges(
    global_ranges: list[tuple[int, int]],
    ip_ranges: list[tuple[int, int]] | None,
) -> list[tuple[int, int]]:
    """Combine global ranges with IP-specific ranges."""
    if not ip_ranges:
        return global_ranges
    if not global_ranges:
        return ip_ranges
    return [*global_ranges, *ip_ranges]


def _port_in_ranges(port: int, ranges: list[tuple[int, int]]) -> bool:
    """Check if port falls within any configured ranges."""
    for start, end in ranges:
        if start <= port <= end:
            return True
    return False
