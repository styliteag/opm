"""Scanner type registry for dynamic scanner type validation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScannerTypeInfo:
    """Metadata for a registered scanner type."""

    name: str
    label: str
    requires_binary: str | None = None


_registry: dict[str, ScannerTypeInfo] = {}


def register_scanner_type(
    name: str, label: str, requires_binary: str | None = None
) -> None:
    """Register a scanner type."""
    _registry[name] = ScannerTypeInfo(
        name=name, label=label, requires_binary=requires_binary
    )


def get_valid_scanner_types() -> tuple[str, ...]:
    """Return tuple of registered scanner type names (for validation)."""
    return tuple(_registry.keys())


def get_scanner_type_metadata() -> list[dict[str, str | None]]:
    """Return list of registered scanner types with metadata."""
    return [
        {
            "name": info.name,
            "label": info.label,
            "requires_binary": info.requires_binary,
        }
        for info in _registry.values()
    ]


# Register built-in scanner types
register_scanner_type("masscan", "Masscan", requires_binary="masscan")
register_scanner_type("nmap", "Nmap", requires_binary="nmap")
register_scanner_type("nse", "NSE Vulnerability", requires_binary="nmap")
register_scanner_type("greenbone", "Greenbone (GVM)", requires_binary=None)
