"""Unit tests for phase-building and nuclei-injection helpers.

These tests nail down the invariant that ``_ensure_nuclei_phase`` runs for
*both* legacy-built and pre-built phase lists, so networks with a stored
``phases`` column still honor ``nuclei_enabled``.
"""

from __future__ import annotations

from src.models import ScannerJob, ScanPhase
from src.orchestration import (
    _build_legacy_phases,
    _ensure_nuclei_phase,
)


def _mk_job(
    *,
    scanner_type: str = "nmap",
    nuclei_enabled: bool = False,
    phases: list[ScanPhase] | None = None,
    nuclei_tags: str | None = None,
    nuclei_severity: str | None = None,
    nuclei_timeout: int | None = None,
) -> ScannerJob:
    return ScannerJob(
        network_id=1,
        cidr="10.0.0.0/24",
        port_spec="80,443",
        rate=None,
        scanner_type=scanner_type,
        scan_timeout=3600,
        port_timeout=1500,
        scan_protocol="tcp",
        phases=phases,
        nuclei_enabled=nuclei_enabled,
        nuclei_tags=nuclei_tags,
        nuclei_severity=nuclei_severity,
        nuclei_timeout=nuclei_timeout,
    )


def _db_style_phases() -> list[ScanPhase]:
    """Mirrors the shape of `networks.phases` stored in the DB:
    host_discovery + port_scan + a DISABLED nmap_nse vulnerability phase."""
    return [
        ScanPhase(
            name="host_discovery", enabled=True, tool="nmap",
            config={"aggressive": False, "max_retries": 2},
        ),
        ScanPhase(
            name="port_scan", enabled=True, tool="nmap",
            config={"port_range": "", "exclude_ports": "", "aggressive": False},
        ),
        ScanPhase(
            name="vulnerability", enabled=False, tool="nmap_nse",
            config={"aggressive": False, "parallel": True, "max_retries": 3},
        ),
    ]


class TestEnsureNucleiPhaseIneligible:
    def test_noop_when_nuclei_disabled(self) -> None:
        job = _mk_job(nuclei_enabled=False)
        phases = _db_style_phases()
        result = _ensure_nuclei_phase(phases, job)
        assert result == phases

    def test_noop_when_scanner_type_is_nse(self) -> None:
        job = _mk_job(scanner_type="nse", nuclei_enabled=True)
        phases = [
            ScanPhase(name="vulnerability", enabled=True, tool="nmap_nse", config={}),
        ]
        result = _ensure_nuclei_phase(phases, job)
        assert result == phases

    def test_noop_when_scanner_type_is_greenbone(self) -> None:
        job = _mk_job(scanner_type="greenbone", nuclei_enabled=True)
        phases: list[ScanPhase] = []
        result = _ensure_nuclei_phase(phases, job)
        assert result == phases


class TestEnsureNucleiPhaseAppends:
    def test_appends_to_db_style_pre_built_phases(self) -> None:
        """The regression: stored network.phases + nuclei_enabled must
        still result in a nuclei phase being appended."""
        job = _mk_job(
            scanner_type="nmap",
            nuclei_enabled=True,
            phases=_db_style_phases(),
            nuclei_tags="cve",
            nuclei_severity="medium",
            nuclei_timeout=1800,
        )
        # The orchestration normally chains legacy/phases + ensure; here
        # we just verify the helper on the pre-built list directly.
        result = _ensure_nuclei_phase(_db_style_phases(), job)
        assert len(result) == 4
        nuclei_phase = result[-1]
        assert nuclei_phase.name == "vulnerability"
        assert nuclei_phase.tool == "nuclei"
        assert nuclei_phase.enabled is True
        assert nuclei_phase.config == {
            "tags": "cve",
            "severity": "medium",
            "timeout": 1800,
        }

    def test_appends_to_legacy_built_phases_nmap(self) -> None:
        job = _mk_job(scanner_type="nmap", nuclei_enabled=True)
        legacy = _build_legacy_phases(job)
        result = _ensure_nuclei_phase(legacy, job)
        assert [p.tool for p in result] == ["nmap", "nuclei"]

    def test_appends_to_legacy_built_phases_masscan(self) -> None:
        job = _mk_job(scanner_type="masscan", nuclei_enabled=True)
        legacy = _build_legacy_phases(job)
        result = _ensure_nuclei_phase(legacy, job)
        assert [p.tool for p in result] == ["masscan", "nuclei"]

    def test_does_not_duplicate_existing_enabled_nuclei_phase(self) -> None:
        existing_nuclei = ScanPhase(
            name="vulnerability", enabled=True, tool="nuclei", config={},
        )
        phases = [
            ScanPhase(name="port_scan", enabled=True, tool="nmap", config={}),
            existing_nuclei,
        ]
        job = _mk_job(scanner_type="nmap", nuclei_enabled=True, phases=phases)
        result = _ensure_nuclei_phase(phases, job)
        assert result == phases

    def test_returns_new_list_does_not_mutate_input(self) -> None:
        phases = _db_style_phases()
        snapshot = list(phases)
        job = _mk_job(scanner_type="nmap", nuclei_enabled=True)
        _ensure_nuclei_phase(phases, job)
        assert phases == snapshot


class TestBuildLegacyPhases:
    def test_nmap_single_phase(self) -> None:
        job = _mk_job(scanner_type="nmap", nuclei_enabled=False)
        phases = _build_legacy_phases(job)
        assert [p.tool for p in phases] == ["nmap"]

    def test_masscan_single_phase(self) -> None:
        job = _mk_job(scanner_type="masscan", nuclei_enabled=False)
        phases = _build_legacy_phases(job)
        assert [p.tool for p in phases] == ["masscan"]

    def test_nse_single_vulnerability_phase(self) -> None:
        job = _mk_job(scanner_type="nse", nuclei_enabled=False)
        phases = _build_legacy_phases(job)
        assert len(phases) == 1
        assert phases[0].tool == "nmap_nse"
        assert phases[0].name == "vulnerability"

    def test_legacy_does_not_append_nuclei_directly(self) -> None:
        """Nuclei injection is now centralised — legacy builder stays lean."""
        job = _mk_job(scanner_type="nmap", nuclei_enabled=True)
        phases = _build_legacy_phases(job)
        assert all(p.tool != "nuclei" for p in phases)
