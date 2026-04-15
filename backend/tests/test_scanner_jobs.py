"""Tests for scanner job serialization."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import NseTemplate
from app.services.scanner_jobs import get_pending_jobs_for_scanner
from app.services.scans import create_manual_scan


class TestScannerJobs:
    async def test_nmap_network_with_default_nse_profile_gets_mixed_pipeline(
        self,
        db_session: AsyncSession,
        network,
        scanner,
    ) -> None:
        """Nmap networks with a default NSE profile should run port scan + NSE."""
        template = NseTemplate(
            name="DNS Recursion",
            description="Checks for recursive DNS resolvers",
            nse_scripts=["dns-recursion"],
        )
        db_session.add(template)
        await db_session.flush()

        network.scanner_type = "nmap"
        network.nse_profile_id = template.id
        await db_session.flush()

        await create_manual_scan(db_session, network)
        await db_session.commit()

        jobs = await get_pending_jobs_for_scanner(db_session, scanner)

        assert len(jobs) == 1
        job = jobs[0]
        assert job.scanner_type == "nmap"
        assert job.nse_scripts == ["dns-recursion"]
        assert job.phases is not None
        assert [phase["name"] for phase in job.phases] == ["port_scan", "vulnerability"]
        assert job.phases[0]["tool"] == "nmap"
        assert job.phases[1]["tool"] == "nmap_nse"

    async def test_nse_network_stays_vulnerability_only(
        self,
        db_session: AsyncSession,
        network,
        scanner,
    ) -> None:
        """Scanner type nse should remain a pure NSE job."""
        template = NseTemplate(
            name="DNS Recursion",
            description="Checks for recursive DNS resolvers",
            nse_scripts=["dns-recursion"],
        )
        db_session.add(template)
        await db_session.flush()

        network.scanner_type = "nse"
        network.nse_profile_id = template.id
        await db_session.flush()

        await create_manual_scan(db_session, network)
        await db_session.commit()

        jobs = await get_pending_jobs_for_scanner(db_session, scanner)

        assert len(jobs) == 1
        job = jobs[0]
        assert job.scanner_type == "nse"
        assert job.phases is None
        assert job.nse_scripts == ["dns-recursion"]
