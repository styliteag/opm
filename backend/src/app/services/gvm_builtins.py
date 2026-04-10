"""Known GVM built-in scan config and port list names.

Upload to the OPM library is rejected when the inner ``<name>`` matches one
of these. The intent is to prevent shadowing a GVM built-in via the
resolution order — without this check, uploading an entry named
``"Full and fast"`` would make OPM push a (potentially different) version to
the scanner on every scan, hiding the real built-in.

This list is the **reject-on-upload shortlist**. The actual set of
built-ins on a running GVM instance will still be reported by the scanner's
metadata snapshot with ``is_builtin=True`` regardless of whether the name
is in this list.
"""

from __future__ import annotations

GVM_BUILTIN_SCAN_CONFIG_NAMES: frozenset[str] = frozenset(
    {
        "Full and fast",
        "Full and deep",
        "Discovery",
        "Host Discovery",
        "System Discovery",
        "Empty",
        "Base",
        "EulerOS Linux Security Configuration",
        "Log4Shell",
    }
)

GVM_BUILTIN_PORT_LIST_NAMES: frozenset[str] = frozenset(
    {
        "All IANA assigned TCP",
        "All IANA assigned TCP and UDP",
        "All TCP",
        "All TCP and Nmap top 100 UDP",
        "All TCP and Nmap top 1000 UDP",
        "All privileged TCP",
        "All privileged TCP and UDP",
        "Nmap top 2000 TCP and top 100 UDP",
        "OpenVAS Default",
        "Web Server-All Ports",
    }
)


def is_builtin_name(kind: str, name: str) -> bool:
    """Return True if ``name`` is a reserved built-in for the given kind."""
    if kind == "scan_config":
        return name in GVM_BUILTIN_SCAN_CONFIG_NAMES
    if kind == "port_list":
        return name in GVM_BUILTIN_PORT_LIST_NAMES
    return False
