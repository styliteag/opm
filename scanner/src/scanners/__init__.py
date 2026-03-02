"""Scanner implementations and registry."""

from src.scanners.masscan import MasscanScanner
from src.scanners.nmap import NmapScanner
from src.scanners.registry import register_scanner

# Register built-in scanners
register_scanner(MasscanScanner())
register_scanner(NmapScanner())
