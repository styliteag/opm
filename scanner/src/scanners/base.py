"""Scanner protocol definition for the extensibility framework."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Protocol, runtime_checkable

from src.models import ScanRunResult

if TYPE_CHECKING:
    from src.client import ScannerClient
    from src.threading_utils import ProgressReporter


@runtime_checkable
class ScannerProtocol(Protocol):
    """Protocol that all scanner implementations must satisfy.

    Each scanner must provide:
    - name: unique identifier string
    - label: human-readable display name
    - run(): execute a scan and return results
    """

    name: str
    label: str

    def run(
        self,
        client: ScannerClient,
        scan_id: int,
        target: str,
        port_spec: str,
        rate: int | None,
        scan_timeout: int,
        port_timeout: int,
        scan_protocol: str,
        is_ipv6: bool,
        logger: logging.Logger,
        progress_reporter: ProgressReporter | None = None,
    ) -> ScanRunResult: ...
