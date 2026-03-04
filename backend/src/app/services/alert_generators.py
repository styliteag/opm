"""Alert generator registry for extensible alert generation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Coroutine

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan

# Type alias for alert generator functions
AlertGeneratorFn = Callable[
    [AsyncSession, Scan, dict[str, Any]],
    Coroutine[Any, Any, int],
]


@dataclass
class AlertGenerator:
    """Registered alert generator."""

    name: str
    fn: AlertGeneratorFn
    requires_ssh: bool
    order: int


_generators: list[AlertGenerator] = []


def register_alert_generator(
    name: str,
    fn: AlertGeneratorFn,
    requires_ssh: bool = False,
    order: int = 100,
) -> None:
    """Register an alert generator function.

    Args:
        name: Unique name for the generator.
        fn: Async function with signature (db, scan, context) -> int.
        requires_ssh: If True, only runs when SSH results were recorded.
        order: Execution order (lower runs first).
    """
    _generators.append(
        AlertGenerator(name=name, fn=fn, requires_ssh=requires_ssh, order=order)
    )
    _generators.sort(key=lambda g: g.order)


def get_alert_generators(has_ssh_results: bool = False) -> list[AlertGenerator]:
    """Return ordered list of alert generators to run.

    Args:
        has_ssh_results: Whether SSH results were recorded for this scan.
    """
    return [
        g for g in _generators
        if not g.requires_ssh or has_ssh_results
    ]


# -- Adapter wrappers for existing generator functions --

async def _global_alerts_adapter(
    db: AsyncSession, scan: Scan, context: dict[str, Any]
) -> int:
    from app.services.alerts import generate_global_alerts_for_scan

    return await generate_global_alerts_for_scan(
        db, scan, context.get("recorded_ports_data")
    )


async def _ssh_alerts_adapter(
    db: AsyncSession, scan: Scan, context: dict[str, Any]
) -> int:
    from app.services.alerts import generate_ssh_alerts_for_scan

    return await generate_ssh_alerts_for_scan(db, scan)


async def _ssh_regression_alerts_adapter(
    db: AsyncSession, scan: Scan, context: dict[str, Any]
) -> int:
    from app.services.alerts import generate_ssh_regression_alerts_for_scan

    return await generate_ssh_regression_alerts_for_scan(db, scan)


# Register built-in generators
register_alert_generator(
    "global_alerts",
    _global_alerts_adapter,
    requires_ssh=False,
    order=10,
)
register_alert_generator(
    "ssh_alerts",
    _ssh_alerts_adapter,
    requires_ssh=True,
    order=20,
)
register_alert_generator(
    "ssh_regression_alerts",
    _ssh_regression_alerts_adapter,
    requires_ssh=True,
    order=30,
)
