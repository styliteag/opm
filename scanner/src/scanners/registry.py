"""Scanner registry for dynamic scanner dispatch."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.scanners.base import ScannerProtocol

_registry: dict[str, ScannerProtocol] = {}


def register_scanner(scanner: ScannerProtocol) -> None:
    """Register a scanner implementation."""
    _registry[scanner.name] = scanner


def get_scanner(name: str) -> ScannerProtocol:
    """Get a registered scanner by name.

    Raises:
        KeyError: If no scanner is registered with the given name.
    """
    if name not in _registry:
        available = ", ".join(sorted(_registry.keys()))
        raise KeyError(f"Unknown scanner type '{name}'. Available: {available}")
    return _registry[name]


def get_available_scanner_types() -> list[dict[str, str]]:
    """Return list of registered scanner types with metadata."""
    return [
        {"name": s.name, "label": s.label}
        for s in _registry.values()
    ]
