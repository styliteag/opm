# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
