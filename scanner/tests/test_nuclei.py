"""Unit tests for the nuclei scanner module."""

from __future__ import annotations

import json
import logging
import subprocess
from typing import Any
from unittest.mock import patch

import pytest

from src.models import OpenPortResult
from src.scanners import nuclei


def _mk_port(ip: str, port: int, service_guess: str | None = None) -> OpenPortResult:
    return OpenPortResult(
        ip=ip,
        port=port,
        protocol="tcp",
        ttl=None,
        banner=None,
        service_guess=service_guess,
        mac_address=None,
        mac_vendor=None,
    )


# ── build_targets ─────────────────────────────────────────────────────────


class TestBuildTargetsNmap:
    """nmap networks: filter by service_guess substring match on http/ssl."""

    def test_selects_http_ports(self) -> None:
        ports = [
            _mk_port("10.0.0.1", 80, "http"),
            _mk_port("10.0.0.1", 22, "ssh"),
            _mk_port("10.0.0.1", 3306, "mysql"),
        ]
        assert nuclei.build_targets(ports, "nmap") == ["10.0.0.1:80"]

    def test_selects_https_and_ssl_tunneled(self) -> None:
        ports = [
            _mk_port("10.0.0.2", 443, "https"),
            _mk_port("10.0.0.2", 8443, "ssl/http"),
            _mk_port("10.0.0.2", 9999, "ssl"),
        ]
        assert nuclei.build_targets(ports, "nmap") == [
            "10.0.0.2:443",
            "10.0.0.2:8443",
            "10.0.0.2:9999",
        ]

    def test_case_insensitive_service_guess(self) -> None:
        ports = [_mk_port("10.0.0.3", 8080, "HTTP-Alt")]
        assert nuclei.build_targets(ports, "nmap") == ["10.0.0.3:8080"]

    def test_ignores_ports_without_service_guess(self) -> None:
        ports = [_mk_port("10.0.0.4", 8080, None)]
        assert nuclei.build_targets(ports, "nmap") == []


class TestBuildTargetsMasscan:
    """masscan networks: filter to hardcoded common web ports."""

    def test_selects_common_web_ports(self) -> None:
        ports = [
            _mk_port("10.0.0.5", 80),
            _mk_port("10.0.0.5", 443),
            _mk_port("10.0.0.5", 8080),
            _mk_port("10.0.0.5", 22),  # rejected
            _mk_port("10.0.0.5", 8443),
        ]
        assert nuclei.build_targets(ports, "masscan") == [
            "10.0.0.5:443",
            "10.0.0.5:80",
            "10.0.0.5:8080",
            "10.0.0.5:8443",
        ]

    def test_ignores_exotic_web_ports(self) -> None:
        """Non-standard web ports on masscan are skipped (service detection is needed)."""
        ports = [_mk_port("10.0.0.6", 7777)]
        assert nuclei.build_targets(ports, "masscan") == []

    def test_service_guess_is_ignored_on_masscan(self) -> None:
        """Even if service_guess is set on a masscan port, only common ports are used."""
        ports = [_mk_port("10.0.0.7", 7777, "http")]
        assert nuclei.build_targets(ports, "masscan") == []


class TestBuildTargetsEligibility:
    def test_nse_rejected(self) -> None:
        """NSE networks are not eligible for nuclei."""
        ports = [_mk_port("10.0.0.8", 80, "http")]
        assert nuclei.build_targets(ports, "nse") == []

    def test_greenbone_rejected(self) -> None:
        ports = [_mk_port("10.0.0.9", 443, "https")]
        assert nuclei.build_targets(ports, "greenbone") == []

    def test_dedupes_and_sorts(self) -> None:
        ports = [
            _mk_port("10.0.0.10", 8080, "http"),
            _mk_port("10.0.0.10", 80, "http"),
            _mk_port("10.0.0.10", 8080, "http"),  # duplicate
        ]
        assert nuclei.build_targets(ports, "nmap") == [
            "10.0.0.10:80",
            "10.0.0.10:8080",
        ]


# ── build_severity_flag ───────────────────────────────────────────────────


class TestBuildSeverityFlag:
    def test_medium_threshold(self) -> None:
        assert nuclei.build_severity_flag("medium") == "medium,high,critical"

    def test_info_threshold(self) -> None:
        assert nuclei.build_severity_flag("info") == "info,low,medium,high,critical"

    def test_critical_threshold(self) -> None:
        assert nuclei.build_severity_flag("critical") == "critical"

    def test_none_defaults_to_medium(self) -> None:
        assert nuclei.build_severity_flag(None) == "medium,high,critical"

    def test_unknown_defaults_to_medium(self) -> None:
        assert nuclei.build_severity_flag("bogus") == "medium,high,critical"

    def test_case_insensitive(self) -> None:
        assert nuclei.build_severity_flag("HIGH") == "high,critical"


# ── parse_nuclei_jsonl ────────────────────────────────────────────────────


def _jsonl(records: list[dict[str, Any]]) -> str:
    return "\n".join(json.dumps(r) for r in records)


class TestParseJsonl:
    def test_cve_finding_with_classification(self) -> None:
        record = {
            "template-id": "cves/2023/CVE-2023-12345",
            "matcher-name": "body-match",
            "ip": "10.0.0.1",
            "port": 8443,
            "info": {
                "name": "Example RCE",
                "description": "Unauthenticated RCE in example",
                "severity": "critical",
                "classification": {
                    "cvss-score": 9.8,
                    "cvss-metrics": "CVSS:3.1/AV:N/AC:L",
                    "cve-id": ["CVE-2023-12345"],
                },
                "reference": ["https://example.com/advisory"],
                "tags": ["cve", "cves2023", "rce"],
            },
        }
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert len(results) == 1
        v = results[0]
        assert v.ip == "10.0.0.1"
        assert v.port == 8443
        assert v.oid == "cves/2023/CVE-2023-12345:body-match"
        assert v.name == "Example RCE"
        assert v.severity_label == "critical"
        assert v.severity == 9.8
        assert v.cvss_base_vector == "CVSS:3.1/AV:N/AC:L"
        assert v.cve_ids == ["CVE-2023-12345"]
        assert v.source == "nuclei"
        assert "Matcher: body-match" in v.description
        assert "Tags:" in v.description
        assert v.solution == "https://example.com/advisory"

    def test_severity_score_fallback_when_classification_missing(self) -> None:
        record = {
            "template-id": "exposures/files/git-config",
            "ip": "10.0.0.2",
            "port": 80,
            "info": {"name": "Exposed .git", "severity": "high"},
        }
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert results[0].severity == 7.5  # high fallback
        assert results[0].cve_ids == []
        assert results[0].cvss_base_vector is None

    def test_empty_matcher_name_preserved_in_oid(self) -> None:
        record = {
            "template-id": "tech/apache",
            "ip": "10.0.0.3",
            "port": 80,
            "info": {"name": "Apache detected", "severity": "info"},
        }
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert results[0].oid == "tech/apache:"

    def test_two_matchers_same_template_become_distinct_rows(self) -> None:
        records = [
            {
                "template-id": "tech/something",
                "matcher-name": "status",
                "ip": "10.0.0.4",
                "port": 443,
                "info": {"name": "Something", "severity": "low"},
            },
            {
                "template-id": "tech/something",
                "matcher-name": "body",
                "ip": "10.0.0.4",
                "port": 443,
                "info": {"name": "Something", "severity": "low"},
            },
        ]
        results = nuclei.parse_nuclei_jsonl(_jsonl(records))
        assert len(results) == 2
        assert {r.oid for r in results} == {
            "tech/something:status",
            "tech/something:body",
        }

    def test_matched_at_url_fallback(self) -> None:
        """When `ip` is missing, parse host+port from matched-at URL."""
        record = {
            "template-id": "http/misconfig/cors",
            "matcher-name": "wildcard",
            "matched-at": "http://192.168.1.5:8080/api",
            "info": {"name": "CORS wildcard", "severity": "medium"},
        }
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert len(results) == 1
        assert results[0].ip == "192.168.1.5"
        assert results[0].port == 8080

    def test_skips_malformed_lines(self) -> None:
        content = "\n".join(
            [
                "not json",
                json.dumps({"template-id": "valid/one", "ip": "10.0.0.5", "port": 80, "info": {"severity": "low"}}),
                "",
                "{incomplete",
            ]
        )
        results = nuclei.parse_nuclei_jsonl(content)
        assert len(results) == 1
        assert results[0].oid == "valid/one:"

    def test_record_without_template_id_is_skipped(self) -> None:
        record = {"ip": "10.0.0.6", "port": 80}
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert results == []

    def test_cve_id_as_string_is_normalized_to_list(self) -> None:
        record = {
            "template-id": "cves/2022/CVE-2022-0001",
            "ip": "10.0.0.7",
            "port": 443,
            "info": {
                "name": "x",
                "severity": "high",
                "classification": {"cve-id": "CVE-2022-0001"},
            },
        }
        results = nuclei.parse_nuclei_jsonl(_jsonl([record]))
        assert results[0].cve_ids == ["CVE-2022-0001"]


# ── run_nuclei ────────────────────────────────────────────────────────────


class _FakeCompleted:
    def __init__(self, returncode: int = 0, stderr: str = "") -> None:
        self.returncode = returncode
        self.stderr = stderr


class TestRunNuclei:
    def test_empty_targets_returns_empty(self) -> None:
        logger = logging.getLogger("test")
        assert nuclei.run_nuclei([], None, "medium", 300, logger) == []

    def test_missing_binary_returns_empty(self) -> None:
        logger = logging.getLogger("test")
        with patch("src.scanners.nuclei.shutil.which", return_value=None):
            result = nuclei.run_nuclei(
                ["10.0.0.1:80"], "cves", "medium", 300, logger
            )
        assert result == []

    def test_subprocess_timeout_returns_empty(self, tmp_path: Any) -> None:
        logger = logging.getLogger("test")
        with patch("src.scanners.nuclei.shutil.which", return_value="/usr/bin/nuclei"), patch(
            "src.scanners.nuclei.subprocess.run",
            side_effect=subprocess.TimeoutExpired("nuclei", 60),
        ):
            result = nuclei.run_nuclei(
                ["10.0.0.1:80"], "cves", "medium", 60, logger
            )
        assert result == []

    def test_happy_path_parses_jsonl_output(
        self, tmp_path: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        logger = logging.getLogger("test")

        jsonl_output = _jsonl(
            [
                {
                    "template-id": "exposures/configs/git-config",
                    "matcher-name": "body",
                    "ip": "10.0.0.1",
                    "port": 80,
                    "info": {"name": "Exposed .git", "severity": "high"},
                }
            ]
        )

        def fake_run(cmd: list[str], **kwargs: Any) -> _FakeCompleted:
            # Find the output path from the command and write the fake JSONL to it.
            out_idx = cmd.index("-o") + 1
            out_path = cmd[out_idx]
            with open(out_path, "w") as fh:
                fh.write(jsonl_output)
            return _FakeCompleted(returncode=2)  # nuclei returns 2 when findings exist

        with patch("src.scanners.nuclei.shutil.which", return_value="/usr/bin/nuclei"), patch(
            "src.scanners.nuclei.subprocess.run", side_effect=fake_run
        ):
            results = nuclei.run_nuclei(
                ["10.0.0.1:80"], "exposures", "medium", 300, logger
            )

        assert len(results) == 1
        assert results[0].oid == "exposures/configs/git-config:body"
        assert results[0].source == "nuclei"

    def test_no_output_file_returns_empty(self) -> None:
        logger = logging.getLogger("test")
        with patch("src.scanners.nuclei.shutil.which", return_value="/usr/bin/nuclei"), patch(
            "src.scanners.nuclei.subprocess.run",
            return_value=_FakeCompleted(returncode=0),
        ):
            result = nuclei.run_nuclei(
                ["10.0.0.1:80"], None, "medium", 300, logger
            )
        assert result == []
