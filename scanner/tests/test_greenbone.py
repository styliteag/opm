"""Unit tests for the GVM result parser."""

from __future__ import annotations

import logging

from src.scanners.greenbone import GreenboneScanner


class _FakeGmp:
    def __init__(self, xml: str) -> None:
        self._xml = xml

    def get_results(self, task_id: str, details: bool = True) -> str:
        assert task_id == "task-1"
        assert details is True
        return self._xml


def test_fetch_results_filters_single_host_scope() -> None:
    xml = """
    <get_results_response status="200" status_text="OK">
      <result>
        <host>194.59.156.71</host>
        <port>53/tcp</port>
        <severity>5.0</severity>
        <description>Expected target finding</description>
        <nvt oid="1.2.3.4">
          <name>DNS Test</name>
        </nvt>
      </result>
      <result>
        <host>213.183.76.93</host>
        <port>8443/tcp</port>
        <severity>0.0</severity>
        <description>Foreign host finding</description>
        <nvt oid="9.9.9.9">
          <name>Allowed HTTP Methods Enumeration</name>
        </nvt>
      </result>
    </get_results_response>
    """

    scanner = GreenboneScanner()
    open_ports, vulnerabilities = scanner._fetch_results(  # noqa: SLF001
        _FakeGmp(xml),
        "task-1",
        "194.59.156.71",
        logging.getLogger("test"),
    )

    assert [(p.ip, p.port, p.protocol) for p in open_ports] == [
        ("194.59.156.71", 53, "tcp"),
    ]
    assert [(v.ip, v.port, v.oid) for v in vulnerabilities] == [
        ("194.59.156.71", 53, "1.2.3.4"),
    ]


def test_fetch_results_keeps_hosts_within_network_scope() -> None:
    xml = """
    <get_results_response status="200" status_text="OK">
      <result>
        <host>10.0.0.10</host>
        <port>80/tcp</port>
        <severity>0.0</severity>
        <description>In-scope host</description>
        <nvt oid="1">
          <name>HTTP Test</name>
        </nvt>
      </result>
      <result>
        <host>10.0.0.200</host>
        <port>443/tcp</port>
        <severity>0.0</severity>
        <description>In-scope host</description>
        <nvt oid="2">
          <name>HTTPS Test</name>
        </nvt>
      </result>
      <result>
        <host>10.0.1.5</host>
        <port>8080/tcp</port>
        <severity>0.0</severity>
        <description>Out-of-scope host</description>
        <nvt oid="3">
          <name>HTTP Alt Test</name>
        </nvt>
      </result>
    </get_results_response>
    """

    scanner = GreenboneScanner()
    open_ports, vulnerabilities = scanner._fetch_results(  # noqa: SLF001
        _FakeGmp(xml),
        "task-1",
        "10.0.0.0/24",
        logging.getLogger("test"),
    )

    assert [(p.ip, p.port) for p in open_ports] == [
        ("10.0.0.10", 80),
        ("10.0.0.200", 443),
    ]
    assert [(v.ip, v.port, v.oid) for v in vulnerabilities] == [
        ("10.0.0.10", 80, "1"),
        ("10.0.0.200", 443, "2"),
    ]
