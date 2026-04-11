"""Nuclei post-phase vulnerability scanner.

Nuclei runs as a post-phase after port discovery on networks with
`scanner_type in (masscan, nmap)` and `nuclei_enabled=True`. Unlike
masscan/nmap/nse, nuclei does NOT implement `ScannerProtocol` — the phase
pipeline calls module-level functions directly because nuclei takes
pre-discovered `IP:PORT` targets rather than a CIDR.

Target-selection rules:
- masscan networks have no service_guess, so we filter open ports to a
  hardcoded list of common web ports. Coverage trade-off: exotic web
  services on non-standard ports are skipped.
- nmap networks get a permissive substring filter on `service_guess`
  matching "http" or "ssl" (case-insensitive).

`oid` is composed as `f"{template_id}:{matcher_name}"` so distinct matcher
variants on the same template-target pair become distinct rows and fire
distinct alerts.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from collections.abc import Iterable, Sequence
from typing import Any

from src.models import OpenPortResult, VulnerabilityResult
from src.threading_utils import ProcessTimeoutWatcher

# Default wall-clock ceiling for the nuclei subprocess, in seconds.
# Overridden per-network via `Network.nuclei_timeout`.
DEFAULT_NUCLEI_TIMEOUT_S = 1800

# Hardcoded web ports used on masscan networks (no service detection).
COMMON_WEB_PORTS: frozenset[int] = frozenset(
    {80, 443, 8000, 8008, 8080, 8081, 8088, 8443, 8888, 9000, 9443}
)

# Ordered severity ladder — used to build the `-severity a,b,c` nuclei flag
# that means "threshold and above".
_SEVERITY_LADDER: tuple[str, ...] = ("info", "low", "medium", "high", "critical")

# Fallback CVSS scores when nuclei templates don't carry a numeric score.
# These are intentionally approximate — severity_label is the primary signal
# for alert dispatch; severity (float) is just for sort/display.
_SEVERITY_SCORE_FALLBACK: dict[str, float] = {
    "info": 0.0,
    "low": 3.0,
    "medium": 5.0,
    "high": 7.5,
    "critical": 9.5,
}

# Environment variable set in the scanner Dockerfile; tests override this.
_NUCLEI_TEMPLATES_DIR_ENV = "NUCLEI_TEMPLATES_DIR"


def build_targets(
    open_ports: Sequence[OpenPortResult],
    scanner_type: str,
) -> list[str]:
    """Build a list of `IP:PORT` targets for nuclei from discovered ports.

    Args:
        open_ports: the port_scan phase output.
        scanner_type: `masscan` or `nmap`; any other value returns an empty
            list because nuclei is only authorized for those two types.

    Returns:
        Deduplicated sorted list of `"IP:PORT"` strings. Nuclei's built-in
        HTTP detection handles scheme probing internally, so targets are
        passed without a scheme prefix.
    """
    if scanner_type not in ("masscan", "nmap"):
        return []

    if scanner_type == "masscan":
        candidates: Iterable[OpenPortResult] = (
            p for p in open_ports if p.port in COMMON_WEB_PORTS
        )
    else:  # nmap
        candidates = (p for p in open_ports if _service_guess_is_web(p.service_guess))

    # Deduplicate — dict preserves insertion order, sorted output is stable.
    seen: dict[str, None] = {}
    for port in candidates:
        key = f"{port.ip}:{port.port}"
        seen[key] = None
    return sorted(seen.keys())


def _service_guess_is_web(service_guess: str | None) -> bool:
    """Return True if nmap's service_guess looks like an HTTP/TLS service."""
    if not service_guess:
        return False
    lowered = service_guess.lower()
    return "http" in lowered or "ssl" in lowered


def build_severity_flag(threshold: str | None) -> str:
    """Build the `-severity` flag value covering `threshold and above`.

    Args:
        threshold: One of info/low/medium/high/critical. None or unknown
            value defaults to `"medium"`.

    Returns:
        Comma-separated severity list for the `-severity` nuclei flag.
    """
    normalized = (threshold or "medium").lower()
    if normalized not in _SEVERITY_LADDER:
        normalized = "medium"
    start = _SEVERITY_LADDER.index(normalized)
    return ",".join(_SEVERITY_LADDER[start:])


def parse_nuclei_jsonl(content: str) -> list[VulnerabilityResult]:
    """Parse nuclei JSONL output into VulnerabilityResult records.

    Silently skips malformed lines. Each non-empty line is one finding.
    """
    results: list[VulnerabilityResult] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        parsed = _parse_nuclei_record(record)
        if parsed is not None:
            results.append(parsed)
    return results


def _parse_nuclei_record(record: dict[str, Any]) -> VulnerabilityResult | None:
    """Convert a single nuclei JSONL record to a VulnerabilityResult.

    Returns None if the record is missing the fields we need to uniquely
    identify the finding (template-id + host).
    """
    template_id = record.get("template-id") or record.get("templateID")
    if not isinstance(template_id, str) or not template_id:
        return None

    info = record.get("info") or {}
    if not isinstance(info, dict):
        info = {}

    ip, port, protocol = _extract_target(record)
    if not ip:
        return None

    matcher_name = record.get("matcher-name") or record.get("matcher_name") or ""
    composed_oid = f"{template_id}:{matcher_name}"

    severity_label = _normalize_severity_label(info.get("severity"))
    severity_float = _extract_cvss_score(info) or _SEVERITY_SCORE_FALLBACK[severity_label]
    cvss_vector = _extract_cvss_vector(info)
    cve_ids = _extract_cve_ids(info)

    name = info.get("name") or template_id
    description = _build_description(info, matcher_name, record)
    solution = _build_solution(info)

    return VulnerabilityResult(
        ip=ip,
        port=port,
        protocol=protocol,
        oid=composed_oid[:255],
        name=str(name)[:500],
        description=description,
        severity=severity_float,
        severity_label=severity_label,  # type: ignore[arg-type]
        cvss_base_vector=cvss_vector,
        cve_ids=cve_ids,
        solution=solution,
        solution_type=None,
        qod=None,
        source="nuclei",
    )


def _extract_target(record: dict[str, Any]) -> tuple[str, int | None, str]:
    """Return (ip, port, protocol) from a nuclei record.

    Nuclei records carry both `host` (scheme+host+port) and `ip` (resolved)
    and `port`. `matched-at` is the most specific. For simplicity we prefer
    `ip` + `port` when present, falling back to parsing `matched-at`.
    """
    ip = record.get("ip")
    port_raw = record.get("port")
    if not isinstance(ip, str) or not ip:
        ip = ""
        matched = record.get("matched-at") or record.get("host")
        if isinstance(matched, str):
            ip, port_from_url = _parse_host_port(matched)
            if port_raw is None:
                port_raw = port_from_url
    port: int | None = None
    if isinstance(port_raw, int):
        port = port_raw
    elif isinstance(port_raw, str) and port_raw.isdigit():
        port = int(port_raw)
    return ip or "", port, "tcp"


def _parse_host_port(value: str) -> tuple[str, int | None]:
    """Extract host + port from a nuclei `matched-at` / `host` field.

    Accepts values like `"http://1.2.3.4:8080/path"`, `"1.2.3.4:443"`,
    `"https://example.com"`. Does not resolve hostnames — the caller
    is expected to fill IP in from the `ip` record field when possible.
    """
    stripped = value
    for prefix in ("https://", "http://"):
        if stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            break
    host_port = stripped.split("/", 1)[0]
    if ":" in host_port:
        host, _, port_str = host_port.rpartition(":")
        try:
            return host, int(port_str)
        except ValueError:
            return host_port, None
    return host_port, None


def _normalize_severity_label(value: Any) -> str:
    """Coerce a nuclei severity string to one of the canonical labels."""
    if isinstance(value, str):
        lowered = value.lower()
        if lowered in _SEVERITY_LADDER:
            return lowered
    return "info"


def _extract_cvss_score(info: dict[str, Any]) -> float | None:
    """Pull a CVSS score out of nuclei's `info.classification` block."""
    classification = info.get("classification")
    if not isinstance(classification, dict):
        return None
    score = classification.get("cvss-score")
    if isinstance(score, (int, float)):
        return float(score)
    if isinstance(score, str):
        try:
            return float(score)
        except ValueError:
            return None
    return None


def _extract_cvss_vector(info: dict[str, Any]) -> str | None:
    """Pull the CVSS vector string out of nuclei's classification block."""
    classification = info.get("classification")
    if not isinstance(classification, dict):
        return None
    vector = classification.get("cvss-metrics")
    if isinstance(vector, str) and vector:
        return vector[:200]
    return None


def _extract_cve_ids(info: dict[str, Any]) -> list[str]:
    """Extract the CVE id list from a nuclei record (may be str or list)."""
    classification = info.get("classification")
    if not isinstance(classification, dict):
        return []
    cve_raw = classification.get("cve-id")
    if cve_raw is None:
        return []
    if isinstance(cve_raw, str):
        return [cve_raw] if cve_raw else []
    if isinstance(cve_raw, list):
        return [str(cve) for cve in cve_raw if isinstance(cve, str) and cve]
    return []


def _build_description(
    info: dict[str, Any],
    matcher_name: str,
    record: dict[str, Any],
) -> str:
    """Concatenate template description + matcher + extracted values."""
    parts: list[str] = []
    desc = info.get("description")
    if isinstance(desc, str) and desc.strip():
        parts.append(desc.strip())
    if matcher_name:
        parts.append(f"Matcher: {matcher_name}")
    extracted = record.get("extracted-results") or record.get("extracted_results")
    if isinstance(extracted, list) and extracted:
        joined = ", ".join(str(v) for v in extracted if v)
        if joined:
            parts.append(f"Extracted: {joined}")
    tags = info.get("tags")
    if isinstance(tags, list) and tags:
        parts.append("Tags: " + ", ".join(str(t) for t in tags))
    elif isinstance(tags, str) and tags:
        parts.append(f"Tags: {tags}")
    return "\n".join(parts) if parts else (str(info.get("name") or ""))


def _build_solution(info: dict[str, Any]) -> str | None:
    """Prefer `info.remediation` over joined references; return None if both empty."""
    remediation = info.get("remediation")
    if isinstance(remediation, str) and remediation.strip():
        return remediation.strip()
    references = info.get("reference")
    if isinstance(references, list) and references:
        joined = "\n".join(str(r) for r in references if r)
        return joined or None
    if isinstance(references, str) and references.strip():
        return references.strip()
    return None


def run_nuclei(
    targets: Sequence[str],
    tags: str | None,
    severity_threshold: str | None,
    timeout_s: int | None,
    logger: logging.Logger,
    templates_dir: str | None = None,
) -> list[VulnerabilityResult]:
    """Invoke nuclei against the given targets and return parsed findings.

    Errors (missing binary, timeout, non-zero exit) are caught here and
    logged; callers get an empty list so the surrounding phase pipeline
    keeps running. This function never raises.
    """
    if not targets:
        logger.info("nuclei: no targets, skipping")
        return []

    if shutil.which("nuclei") is None:
        logger.warning(
            "nuclei binary not available on this scanner — skipping nuclei phase. "
            "Rebuild the scanner image to add nuclei support."
        )
        return []

    resolved_timeout = timeout_s if timeout_s and timeout_s > 0 else DEFAULT_NUCLEI_TIMEOUT_S
    templates_path = templates_dir or os.environ.get(
        _NUCLEI_TEMPLATES_DIR_ENV, "/opt/nuclei-templates"
    )
    severity_flag = build_severity_flag(severity_threshold)

    with tempfile.TemporaryDirectory(prefix="nuclei-") as tmpdir:
        targets_file = os.path.join(tmpdir, "targets.txt")
        output_file = os.path.join(tmpdir, "out.jsonl")
        with open(targets_file, "w", encoding="utf-8") as fh:
            fh.write("\n".join(targets))

        cmd: list[str] = [
            "nuclei",
            "-list",
            targets_file,
            "-t",
            templates_path,
            "-severity",
            severity_flag,
            "-jsonl",
            "-o",
            output_file,
            "-silent",
            "-timeout",
            "10",
            "-retries",
            "1",
            "-disable-update-check",
            "-stats",
            "-stats-interval",
            "15",
        ]
        if tags:
            cmd.extend(["-tags", tags])

        logger.info(
            "nuclei: running against %d target(s), severity>=%s, tags=%s, timeout=%ds",
            len(targets),
            severity_threshold or "medium",
            tags or "(default)",
            resolved_timeout,
        )
        try:
            process = subprocess.Popen(  # noqa: S603 — trusted command
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,  # line-buffered so `-stats` lines surface in real time
            )
        except (FileNotFoundError, OSError) as exc:
            logger.warning("nuclei: subprocess failed to start: %s", exc)
            return []

        timeout_watcher = ProcessTimeoutWatcher(
            process=process,
            timeout_seconds=resolved_timeout,
            logger=logger,
            label="Nuclei",
        )
        timeout_watcher.start()

        output_tail: list[str] = []
        try:
            if process.stdout is not None:
                for raw_line in process.stdout:
                    line = raw_line.strip()
                    if not line:
                        continue
                    logger.info("nuclei: %s", line)
                    output_tail.append(line)
                    # Keep the tail bounded — only used for error diagnostics.
                    if len(output_tail) > 20:
                        output_tail.pop(0)
            returncode = process.wait()
        finally:
            timeout_watcher.stop()
            timeout_watcher.join()

        if timeout_watcher.timed_out:
            logger.warning(
                "nuclei: subprocess timed out after %ds — partial results (if any) discarded",
                resolved_timeout,
            )
            return []

        if returncode not in (0, 2):
            # Exit 0 = no findings, exit 2 = findings present. Anything else is
            # a real error but we still try to parse whatever was written.
            logger.warning(
                "nuclei: non-zero exit %s; last output: %s",
                returncode,
                "\n".join(output_tail)[:500],
            )

        try:
            with open(output_file, encoding="utf-8") as fh:
                output = fh.read()
        except FileNotFoundError:
            logger.info("nuclei: no findings (no output file)")
            return []

    findings = parse_nuclei_jsonl(output)
    logger.info("nuclei: parsed %d finding(s)", len(findings))
    return findings
