# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Hostname enrichment now enriches all pingable public hosts, not just those with known open ports
- Hostname enrichment reordered and expanded. New lookup priority:
  1. **SSL Certificate** — nmap `ssl-cert` script on common SSL/STARTTLS ports (local, no API, most authoritative)
  2. **Google DNS** — PTR lookup via `dns.google` JSON API (fast, reliable, no limit)
  3. **ip-api.com** — batch PTR / reverse DNS
  4. **HackerTarget** — DNS A-record reverse lookup (20 free req/day, fills in over runs)
  5. **crt.sh** — certificate transparency logs (last resort)

### Improved
- crt.sh: reduced timeout from 15s to 5s, suppressed expected 404 warnings to debug level, added bail-out after 3 consecutive failures
- HackerTarget: suppressed "No DNS A records found" from being logged as a hostname

## [1.1.18] - 2026-02-24

### Fixed
- Host hostname no longer overwritten by subsequent scans — once a hostname is set (manually or via enrichment), it is preserved

### Added
- Hostname enrichment caching: backend sends known hostnames with the host discovery claim response, so the scanner skips external API calls for already-resolved IPs
- Hostname enrichment filtering: skip private IPs (RFC1918, ULA, link-local) from external API lookups
- Skip HackerTarget and crt.sh for IPv6 addresses (only ip-api.com supports IPv6 PTR lookups)
- Hostname enrichment via external APIs during host discovery scan. When nmap reverse DNS finds no hostname, the scanner now queries additional free services:
  1. **ip-api.com** — PTR / reverse DNS (batch, fast)
  2. **HackerTarget** — DNS A-record reverse lookup (finds domains pointing to the IP)
  3. **crt.sh** — certificate transparency logs (fallback)
- Host Detail dashboard page (`/hosts/:hostId`) — a single overview page per host/IP showing all relevant information at a glance:
  - Host info card with IP, hostname, MAC address/vendor, pingable status, networks, editable comment, and rescan button
  - Active alerts section with severity badges and quick-acknowledge button, plus collapsible acknowledged alerts
  - Open ports table with service names and banners
  - SSH security summary showing auth methods, version, and weak cipher/KEX warnings
  - Recent scan history with links to scan details
- `GET /api/hosts/{host_id}/overview` backend endpoint that aggregates all host data in a single API call
- `ip` query parameter on `GET /api/alerts` to filter alerts by host IP address
- Clickable IP addresses in Hosts, Alerts, and Open Ports pages linking to the host detail dashboard

## [1.1.17] - 2026-02-04

### Fixed
- Cron schedules were incorrectly interpreted as UTC times. A schedule like `03 1 * * *` now correctly runs at 01:03 local time (e.g., CET) instead of 01:03 UTC (which was 02:03 CET).

### Added
- `TZ` environment variable support in all Docker containers (app, db, scanner) with default `Europe/Berlin`
- `SCHEDULE_TIMEZONE` configuration option to explicitly set the timezone for cron schedule interpretation
- `tzdata` package installed in all Docker images for proper timezone support

### Changed
- Scheduler now defaults to server's local timezone when `SCHEDULE_TIMEZONE` is not set
- MariaDB container now respects `TZ` environment variable for log timestamps

## [1.1.16] - 2026-02-04

### Fixed
- Scheduled scans triggering multiple times (once per uvicorn worker) due to race condition in multi-worker setup. Added database row-level locking with `SELECT ... FOR UPDATE SKIP LOCKED` to ensure only one worker creates a scan per network.
- Clearing scan schedule by sending empty string not saving. The API now properly detects when `scan_schedule` is explicitly set to empty/null and clears it.

## [1.1.15] - 2026-02-03

## [1.1.14] - 2026-02-03

## [1.1.13] - 2026-02-03

### Added
- Single-host rescan feature for targeted nmap scans from Risk Overview and Hosts pages
  - New `target_ip` field in Scan model to differentiate network scans from single-host scans
  - `/api/hosts/{host_ip}/rescan` endpoint to trigger single-host rescans
  - `/api/ssh/hosts/{host_ip}/recheck` endpoint to recheck SSH security for a single host
  - "Rescan" button in Hosts page for admin users
  - "Rescan" button in Risk Overview page for admin users
  - "Recheck" button in SSH Security page for SSH security rechecks
  - Scanner automatically uses nmap for single-host scans for better service detection
- Global SSH alert settings: Configure default SSH security alert settings from the SSH Security Dashboard
- Network-level SSH alert override: Networks can now use global defaults or define custom SSH alert settings
- "Use Global Defaults" toggle in network alert settings to easily switch between default and custom configurations

### Security
- Added defensive input sanitization in scanner to prevent potential command injection attacks
  - New `sanitize_cidr()` function validates CIDR notation and rejects shell metacharacters
  - New `sanitize_port_spec()` function validates port specifications and rejects shell metacharacters
  - Applied sanitization to all scanner subprocess calls (masscan, nmap, host discovery)
  - Comprehensive test coverage with 23 unit tests for sanitization functions
### Changed
- Improved SSH probe logging to explicitly show timeout value for better visibility and debugging
- CORS configuration now allows all origins (`allow_origins=["*"]`) for maximum flexibility
  - **Security Note**: This configuration allows credentials from any origin and should only be used in development environments

## [1.1.12] - 2026-02-01

## [1.1.11] - 2026-02-01

## [1.1.10] - 2026-01-31

## [1.1.9] - 2026-01-31

## [1.1.8] - 2026-01-31

### Added
- Backend test suite with 128 tests covering security, auth, users, networks, scans, and alerts
- Test infrastructure with async SQLite fixtures, factories, and authentication helpers

### Changed
- **Major refactoring**: Split monolithic 2400-line `scanner/src/main.py` into focused modules for better maintainability
  - `scanner/src/main.py` (69 lines) - Entry point and main event loop only
  - `scanner/src/models.py` (115 lines) - All dataclass definitions
  - `scanner/src/client.py` (392 lines) - HTTP client for backend communication
  - `scanner/src/threading_utils.py` (276 lines) - Thread classes for logging, progress, timeouts, and cancellation
  - `scanner/src/utils.py` (242 lines) - Utility functions for parsing, formatting, config, and logging
  - `scanner/src/orchestration.py` (243 lines) - Job processing and orchestration logic
  - `scanner/src/discovery.py` (294 lines) - Host discovery and SSH probing
  - `scanner/src/scanners/masscan.py` (287 lines) - Masscan scanner implementation
  - `scanner/src/scanners/nmap.py` (817 lines) - Nmap scanner implementation
- Admin user initialization now runs once before workers start, eliminating retry loop in application startup

### Fixed
- FastAPI app version now uses `get_version()` instead of hardcoded "0.1.0"
- Removed runtime sed injection for frontend version; now baked in at build time via Vite
- Eliminated magic strings in alert styling by centralizing alert type labels and styles into `frontend/src/constants/alerts.ts`
- Home page N+1 query: replaced N HTTP requests for latest scans with single `/api/scans/latest-by-network` endpoint

## [1.1.7] - 2026-01-31

## [1.1.6] - 2026-01-31
### Fixed
- Fixed migration version check to use raw SQL query instead of SQLAlchemy MigrationContext
- Database migrations now run before uvicorn workers start, preventing race conditions in multi-worker deployments
- Made all database migrations idempotent to handle schema drift from previous `create_all()` usage

## [1.1.5] - 2026-01-31

## [1.1.4] - 2026-01-31

## [1.1.3] - 2026-01-31

### Fixed
- Database migrations now use MySQL advisory lock to prevent race conditions when multiple workers start simultaneously
- Migrations now check if already at head revision before running, avoiding duplicate migration logs
- Scanner now waits for backend to be ready before polling for jobs, avoiding startup errors when backend is still initializing

## [1.1.2] - 2026-01-31

## [1.1.1] - 2026-01-31

## [1.1.0] - 2026-01-31

### Added
- **SSH Security Scanning**: Automatic security analysis of discovered SSH services
  - Authentication method detection (publickey, password, keyboard-interactive)
  - Weak cipher detection (DES, 3DES, RC4, Blowfish, CBC modes)
  - Weak key exchange algorithm detection (SHA1-based, weak DH groups)
  - SSH version tracking with configurable outdated version threshold
  - Configuration regression detection between scans
- **SSH Security Dashboard**: New dedicated page for SSH security monitoring
  - Summary cards showing total hosts, insecure auth, weak ciphers, outdated versions
  - Filterable and sortable hosts table
  - Network filter dropdown
  - Configuration change indicators
- **SSH Compliance Reports**: Export capabilities for compliance and auditing
  - PDF report with executive summary and remediation recommendations
  - CSV export for further analysis
- **SSH Alert Types**: New alert categories for SSH security issues
  - `ssh_insecure_auth`: Password or keyboard-interactive authentication enabled
  - `ssh_weak_cipher`: Server supports weak encryption ciphers
  - `ssh_weak_kex`: Server supports weak key exchange algorithms
  - `ssh_outdated_version`: SSH version below configured threshold
  - `ssh_config_regression`: SSH configuration became less secure
- **SSH Alert Configuration**: Per-network alert settings for SSH security
- **API Documentation**: Comprehensive SSH API documentation

### Changed
- Scanner now includes ssh-audit tool for SSH security probing
- Scan workflow extended with SSH probing phase (90-100% progress)

## [1.0.3] - 2026-01-25

## [1.0.2] - 2026-01-25

### Added
- Scan progress tracking with percentage and message, displayed in the UI

## [1.0.1] - 2026-01-25

### Fixed
- Enhanced admin user creation with retry logic and exponential backoff to handle race conditions and deadlocks

## [1.0.0] - 2026-01-25

## [0.9.13] - 2026-01-25

## [0.9.12] - 2026-01-25

## [0.9.11] - 2026-01-25

## [0.9.10] - 2026-01-25

## [0.9.9] - 2026-01-25

## [0.9.8] - 2026-01-25

## [0.9.0] - 2026-01-25

### Added
- Initial release of Open Port Monitor
- **Web Dashboard**: React + Vite frontend with responsive design
- **REST API**: FastAPI backend with automatic OpenAPI documentation
- **Distributed Scanning**: Multi-site scanner support with site authentication
- **Network Management**: Create and manage networks with CIDR notation
- **Port Scanning**: Nmap-based scanning with progress tracking
- **Protocol Support**: TCP and UDP port scanning capabilities
- **IPv6 Support**: Full IPv6 network detection and scanning
- **Scan Management**: Start, cancel, and monitor scan progress
- **Scan Visibility**: Hide/show scans for cleaner dashboard views
- **Port Discovery**: Track discovered ports with protocol information
- **Alerting System**: Email notifications via SMTP
- **User Authentication**: JWT-based authentication system
- **Docker Support**: Multi-architecture Docker images (amd64/arm64)
- **Development Environment**: Docker Compose setup with hot-reloading
