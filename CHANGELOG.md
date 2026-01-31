# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
