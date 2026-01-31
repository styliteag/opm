"""Threading utilities for the scanner agent."""

from __future__ import annotations

import logging
import subprocess
import traceback
from datetime import datetime, timezone
from threading import Event, Lock, Thread
from typing import TYPE_CHECKING

from src.models import LogEntry
from src.utils import normalize_log_level

if TYPE_CHECKING:
    from src.client import ScannerClient

# Constants
LOG_STREAM_INTERVAL_SECONDS = 5
PROGRESS_REPORT_INTERVAL_SECONDS = 5
CANCEL_POLL_INTERVAL_SECONDS = 5


class LogBufferHandler(logging.Handler):
    """Collects log entries for periodic streaming."""

    def __init__(self) -> None:
        super().__init__()
        self._lock = Lock()
        self._entries: list[LogEntry] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
        except Exception:
            message = "<failed to format log message>"
        if record.exc_info:
            exception_text = "".join(traceback.format_exception(*record.exc_info)).strip()
            message = f"{message}\n{exception_text}"
        level = normalize_log_level(record.levelname)
        entry = LogEntry(timestamp=datetime.now(timezone.utc), level=level, message=message)
        with self._lock:
            self._entries.append(entry)

    def drain(self) -> list[LogEntry]:
        """Drain all buffered log entries."""
        with self._lock:
            entries = self._entries
            self._entries = []
        return entries

    def requeue(self, entries: list[LogEntry]) -> None:
        """Requeue entries that failed to send."""
        if not entries:
            return
        with self._lock:
            self._entries = entries + self._entries

    def reset(self) -> None:
        """Reset the log buffer."""
        with self._lock:
            self._entries = []


class LogStreamer(Thread):
    """Background thread to stream logs to the backend during a scan."""

    def __init__(
        self,
        client: ScannerClient,
        log_buffer: LogBufferHandler,
        scan_id: int,
        interval: int = LOG_STREAM_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._log_buffer = log_buffer
        self._scan_id = scan_id
        self._interval = interval
        self._stop_event = Event()

    def stop(self) -> None:
        """Stop the log streamer thread."""
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            self._flush()
            if self._stop_event.wait(self._interval):
                break
        self._flush()

    def _flush(self) -> None:
        entries = self._log_buffer.drain()
        if not entries:
            return
        try:
            self._client.submit_logs(self._scan_id, entries)
        except Exception:
            self._log_buffer.requeue(entries)


class ProgressReporter(Thread):
    """Background thread to report scan progress to the backend."""

    def __init__(
        self,
        client: ScannerClient,
        scan_id: int,
        interval: int = PROGRESS_REPORT_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._scan_id = scan_id
        self._interval = interval
        self._stop_event = Event()
        self._lock = Lock()
        self._current_percent: float = 0.0
        self._current_message: str | None = None
        self._last_reported_percent: float = -1.0
        self._last_reported_message: str | None = None

    def stop(self) -> None:
        """Stop the progress reporter thread."""
        self._stop_event.set()

    def update(self, percent: float, message: str | None = None) -> None:
        """Update the current progress values (thread-safe)."""
        with self._lock:
            self._current_percent = max(0.0, min(100.0, float(percent)))
            self._current_message = message

    def run(self) -> None:
        while not self._stop_event.is_set():
            self._report()
            if self._stop_event.wait(self._interval):
                break
        # Final report on stop
        self._report()

    def _report(self) -> None:
        with self._lock:
            percent = self._current_percent
            message = self._current_message

        # Only report if progress changed or we haven't reported yet
        if percent == self._last_reported_percent and message == self._last_reported_message:
            return

        try:
            self._client.submit_progress(self._scan_id, percent, message)
            self._last_reported_percent = percent
            self._last_reported_message = message
        except Exception:
            # Silently ignore progress report failures to not disrupt scan
            pass


class ProcessTimeoutWatcher(Thread):
    """Watchdog thread to warn and terminate long-running scan processes."""

    def __init__(
        self,
        process: subprocess.Popen[str],
        timeout_seconds: int,
        logger: logging.Logger,
        label: str,
    ) -> None:
        super().__init__(daemon=True)
        self._process = process
        self._timeout_seconds = max(0, timeout_seconds)
        self._logger = logger
        self._label = label
        self._stop_event = Event()
        self._timed_out = Event()

    @property
    def timed_out(self) -> bool:
        """Check if the process has timed out."""
        return self._timed_out.is_set()

    def stop(self) -> None:
        """Stop the timeout watcher thread."""
        self._stop_event.set()

    def run(self) -> None:
        if self._timeout_seconds <= 0:
            return

        warning_delay = self._timeout_seconds * 0.9
        if warning_delay > 0:
            if self._stop_event.wait(warning_delay):
                return
            if self._process.poll() is None:
                self._logger.warning(
                    "%s scan approaching timeout (90%% elapsed)",
                    self._label,
                )

        remaining = self._timeout_seconds - warning_delay
        if remaining > 0:
            if self._stop_event.wait(remaining):
                return

        if self._process.poll() is not None:
            return

        self._logger.error(
            "%s scan exceeded timeout (%s seconds); terminating",
            self._label,
            self._timeout_seconds,
        )
        self._timed_out.set()
        self._process.terminate()
        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._logger.error("%s scan did not terminate gracefully; killing", self._label)
            self._process.kill()


class ScanCancellationWatcher(Thread):
    """Watch for scan cancellation and terminate the scan process."""

    def __init__(
        self,
        client: ScannerClient,
        scan_id: int,
        process: subprocess.Popen[str],
        logger: logging.Logger,
        interval: int = CANCEL_POLL_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._scan_id = scan_id
        self._process = process
        self._logger = logger
        self._interval = interval
        self._stop_event = Event()
        self._cancelled = Event()

    @property
    def cancelled(self) -> bool:
        """Check if the scan was cancelled."""
        return self._cancelled.is_set()

    def stop(self) -> None:
        """Stop the cancellation watcher thread."""
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            status: str | None = None
            try:
                status = self._client.get_scan_status(self._scan_id)
            except Exception as exc:
                self._logger.warning(
                    "Failed to check scan status for %s: %s", self._scan_id, exc
                )

            if status == "cancelled":
                self._logger.warning("Scan cancelled by user request")
                self._cancelled.set()
                if self._process.poll() is None:
                    self._process.terminate()
                    try:
                        self._process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self._logger.error(
                            "Scan did not terminate gracefully after cancellation; killing"
                        )
                        self._process.kill()
                break

            if self._stop_event.wait(self._interval):
                break
