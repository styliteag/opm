"""IP address utilities shared across routers and services."""

from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network

IPRange = tuple[int, IPv4Address | IPv6Address, IPv4Address | IPv6Address]


def parse_ip_range(value: str) -> IPRange:
    """Parse an IP range value into a normalized (version, start, end) tuple.

    Accepts CIDR notation (e.g., 192.168.1.0/24) or dash-separated ranges
    (e.g., 192.168.1.10-192.168.1.50).
    """
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("ip_range cannot be empty")

    try:
        if "-" in raw_value:
            start_raw, end_raw = [part.strip() for part in raw_value.split("-", 1)]
            if not start_raw or not end_raw:
                raise ValueError("Invalid ip_range format")
            start_ip = ip_address(start_raw)
            end_ip = ip_address(end_raw)
            if start_ip.version != end_ip.version:
                raise ValueError("IP range must use the same IP version")
        else:
            network = ip_network(raw_value, strict=False)
            start_ip = network.network_address
            end_ip = network.broadcast_address

        if int(start_ip) > int(end_ip):
            raise ValueError("IP range start must be before end")
    except ValueError as exc:
        raise ValueError(
            "Invalid ip_range; expected CIDR (e.g., 192.168.1.0/24) "
            "or range (e.g., 192.168.1.10-192.168.1.50)"
        ) from exc

    return (start_ip.version, start_ip, end_ip)
