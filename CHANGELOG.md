# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Convert "Add Rule" form on port-rules page from inline row to dialog popup

## [1.9.5] - 2026-04-04

### Added

- Server-side column sorting to hosts table (IP, Hostname, Last Seen)
- Server-side column sorting to global ports table (IP, Port, Last Seen)

### Changed

- Rebrand from "Onyx Port Monitor" to "STYLiTE Orbit Monitor" across all files

## [1.9.4] - 2026-04-04

### Changed

- Frontend design system migrated to Linear-inspired aesthetic (DESIGN.md)
- Color system: cyan accent replaced with indigo-violet (#5e6ad2 / #7170ff / #828fff)
- Dark mode surfaces now use pure dark palette (#0f1011, #191a1b) instead of blue-slate
- Borders now use semi-transparent white (rgba(255,255,255,0.05-0.08)) instead of solid dark
- Typography: Inter Variable with OpenType features cv01, ss03 globally; removed Space Grotesk display font
- Font weight system: 400 (read), 510 (emphasis), 590 (strong) — no more weight 700
- Chart tooltip styles updated from hsl(var()) to var() for hex/rgba token compatibility
- Dashboard cards: removed backdrop-blur-sm in favor of luminance-based elevation
- Replaced hardcoded cyan-* classes with primary token references

### Removed

- Space Grotesk font dependency (display headings now use Inter Variable)
- @fontsource-variable/geist dependency (replaced by @fontsource-variable/inter)

### Added

- @fontsource-variable/inter for Inter Variable font (supports weight 510, 590)
- @fontsource/jetbrains-mono for code/technical content
- Custom Tailwind utilities: font-emphasis (weight 510), font-strong (weight 590)
- Linear surface tokens (surface-0 through surface-3), text hierarchy tokens, brand tokens
- Severity colors preserved as functional status indicators alongside achromatic system

## [1.9.3] - 2026-04-03

### Added

- Server-side column sorting on alerts table — all columns (severity, alert, target, network, status, detected) are sortable

## [1.9.2] - 2026-04-03

### Added

- Full-text search on alerts page — searches across IP, message, hostname, network name, and port

## [1.9.1] - 2026-04-03

### Added

- System info card on dashboard showing backend version, frontend version, and DB migration status
- Backend `/api/version` endpoint now includes migration state (current revision, head revision, status)
- Frontend version injected at build time from VERSION file via Vite define

## [1.9.0] - 2026-03-29

### Security

- Fix 5 npm dependency vulnerabilities (path-to-regexp, picomatch, brace-expansion) via overrides and dependency updates

### Changed

- Fix all backend lint errors (ruff E501, E402, F401, I001) and frontend lint errors (unused vars, impure render calls, react-refresh exports, React Compiler warnings)

### Fixed

- EnrichedHostPort schema now includes `id` field so port comment inline editing can PATCH by port ID
- Alert detail page fetches single alert by ID instead of scanning full list (works for any alert, not just first 200)
- HostActivityFeed displays MessageSquare icon for `alert_action` events instead of falling back to default

### Added

- `GET /api/alerts/{id}/timeline` endpoint with scan-anchored grouping and port_seen tracking
- `PATCH /api/global-ports/{id}/comment` endpoint for updating port comments (EDIT-01)
- Recurrence detection: resolved alerts automatically reopen when the same port reappears in a scan
- CREATED events emitted for every new alert during scan alert generation
- Event emission on all alert state changes: dismiss, reopen, assign, status change, severity override, comment, and auto-dismiss from rules
- Host timeline now includes alert lifecycle events (dismissed, reopened, assigned, etc.)
- Frontend typed API client functions for alert timeline, host timeline, and port comment endpoints
- InlineTextCell reusable click-to-edit component for table cells with keyboard and accessibility support
- ScanPresenceChart dot chart component showing port presence across scans with color-coded dots and legend
- AlertActivityFeed component with vertical timeline of alert events, icons per event type, and relative timestamps
- HostActivityFeed component with paginated vertical timeline using infinite query and Load more button
- Alert detail page: scan presence dot chart showing port presence across scans
- Alert detail page: chronological activity feed of all alert lifecycle events
- Host detail page: consolidated activity feed replacing basic timeline tab
- Host detail port table: inline click-to-edit port comments
- Hosts list table: user_comment column with inline editing
- Hosts list table: inline-editable hostname column

### Changed

- `reopen_alert()` now resets `resolution_status` to OPEN in addition to clearing dismissed state
- Auto-dismiss functions refactored from bulk UPDATE to load-then-iterate for per-alert event emission

### Added

- Create shared `Select` UI component (`components/ui/select.tsx`) with consistent styling matching Input component patterns (CVA, `data-slot`, focus-visible rings, dark mode, disabled/invalid states)
- Add skip-to-main-content link in AppShell for keyboard navigation
- Add `aria-label` attributes to AlertsTable checkboxes, sort buttons, and action menus
- Add `aria-label` to AlertFilters dropdown triggers and filter group container
- Add `aria-label` to Header theme switcher and breadcrumb nav
- Add `aria-label` to QuickScanModal close button
- Add `role="img"` with descriptive `aria-label` to ThreatPulseChart
- Replace raw `<input type="checkbox">` in HostsTable with shared `Checkbox` component and `aria-label`
- Add tests for `Select` and `SelectOption` components

### Changed

- Replace all inline-styled `<select>` elements (15 files) with shared `Select` component, eliminating duplicated `selectClass` / `SELECT_CLASS` constants
- Migrate QuickScanModal from custom overlay to shared `Dialog` component for consistent modal behavior (backdrop blur, animations, close button, focus trap)
- Replace inline magic number in HostsTable status check with `isOnline()` utility from `utils.ts`

### Fixed

- Fix backend crash on startup: empty prefix and path in alerts list sub-router (`GET /api/alerts/`)
- Fix 307 redirect leak exposing Docker-internal hostname (`backend:8000`) to browser via FastAPI slash redirect on alerts list endpoint
- Disable `react-refresh/only-export-components` lint rule for TanStack Router route files
- Fix `react-hooks/purity` lint error for `Date.now()` in scanners page online status check
- Remove duplicate `create_comment` route handler in alerts router
- Fix missing `datetime` and `ip_network` imports in hosts router after refactor
- Fix `_is_version_outdated` undefined name in SSH router (renamed to `is_version_outdated`)

### Changed

- Apply consistent code formatting (double quotes, semicolons) across frontend route and feature files
- Use `scanStatusVariant` utility for scan status badge styling
- Extract `parse_ip_range()` to `backend/src/app/lib/ip_utils.py` — shared by hosts and ports services
- Extract SSH version parsing (`parse_ssh_version`, `is_version_outdated`) to `backend/src/app/lib/ssh_utils.py`
- Add `PaginationParams` dataclass and `Pagination` dependency to `core/deps.py`; applied to alerts, scans, ssh, and networks routers
- Create standard HTTP exception subclasses in `backend/src/app/core/exceptions.py`
- Create shared PDF/CSV export utilities in `backend/src/app/lib/export.py`; applied to alerts, hosts, and scans routers
- Extract `formatRate()`, `isOnline()`, and `getScanDisplayTime()` to `frontend/src/lib/utils.ts`
- Move SSH and NSE alert type constants to `frontend/src/lib/alert-types.ts`; removed duplication from PortRulesEditor and port-rules route
- Create generic `DataTable<T>` component in `frontend/src/components/data-display/DataTable.tsx`; adopted in scans/index and scanners pages
- Split port-rules page into feature module: `features/port-rules/types.ts`, `hooks/usePortRules.ts`, `components/{SourceBadge,GlobalRuleAddForm,RuleRow,RuleSection}.tsx`
- Split `services/alerts.py` (1372 lines) into focused modules: `alert_queries.py`, `alert_generation.py`, `ssh_alert_generation.py`, `port_rule_matching.py` with backward-compatible re-export facade
- Split `routers/alerts.py` (1420 lines) into sub-router package: `alerts/{list,detail,actions,comments,workflow}.py`
- Alert event log: append-only `alert_events` table with Alembic migration, `AlertEvent` model, `emit_event()` service, and Pydantic schema

## [1.8.1] - 2026-03-25

## [1.8.0] - 2026-03-25

## [1.8.0] - 2026-03-25

> **Breaking: This release requires a fresh database.** All migrations have been
> consolidated into a single initial schema. Drop your existing database and let
> the application recreate it on startup:
>
> ```bash
> # Via Docker (recommended)
> docker exec opm-db mariadb -u root -p<ROOT_PASSWORD> -e \
>   "DROP DATABASE <DB_NAME>; CREATE DATABASE <DB_NAME>;"
> docker restart opm-backend
> ```
>
> The admin user and NSE profiles will be re-seeded automatically.

### Changed
- Consolidate all database migrations into a single initial schema
- Checkbox component: improve unchecked border visibility in dark mode
- Port rules page: selected rows now highlight, disabled badge uses muted pill style

## [1.7.0] - 2026-03-25

### Added
- Accept modal with scope selection (global/network) and required reason for all accept actions
- Dismiss modal now explains the difference to Accept and requires a reason
- Accept button on alert detail page alongside Dismiss
- Alert action comments (dismiss/accept) now appear in host timeline
- Multiselect on port rules page with bulk actions: enable, disable, delete
- `enabled` column on alert rules — disabled rules are skipped during evaluation
- Bulk API endpoints: `POST /api/port-rules/bulk-delete`, `bulk-enable`, `bulk-disable`

### Fixed
- NSE result submission no longer prematurely marks scan as completed, which was preventing port results from being saved

### Changed
- Rebrand project from "Open Port Monitor" to "STYLiTE Orbit Monitor" (OPM); update display name, Docker images (`styliteag/opm`, `styliteag/opm-scanner`), package names, DB defaults, and all documentation
- Redesign Add/Edit Network modal with sectioned layout (Network, Scanner, Phases, Schedule & Alerts)
- Widen network form dialog from `sm:max-w-sm` to `sm:max-w-3xl` for better field density
- NSE Profile field now highlights with warning when vulnerability phase is enabled but no profile is selected

## [1.6.1] - 2026-03-25

### Added
- Multi-phase scan pipeline on networks: Host Discovery → Port Scan → Vulnerability
- Phase toggle cards in network form (SiriusScan-style) with per-phase config
- Phase-aware progress reporting in scanner: "Port Scan: 45% (2 of 3 phases)"
- `phases` JSON column on networks table for pipeline configuration
- Sequential phase pipeline in scanner agent with inter-phase data flow

## [1.6.0] - 2026-03-24

## [1.5.1] - 2026-03-23

## [1.5.0] - 2026-03-23

## [1.4.1] - 2026-03-23

## [1.4.0] - 2026-03-23

### Added
- **Live Scan Rate**: Actual packets-per-second displayed on scan detail page during execution — parsed from masscan output, estimated for nmap scans
- **Port Staleness Detection**: Ports not found in the latest completed scan are flagged as "Stale" with dimmed rows and an All/Active/Stale filter toggle on the Global Ports view
- **QuickScan Estimate**: Scan runtime estimate (IPs × ports ÷ pps) shown in the Quick Scan modal when a network is selected
- **NSE Vulnerability Scanner**: New scanner type using Nmap Scripting Engine for vulnerability detection and CVE discovery
- **Scan Profiles**: 22 built-in scan profiles organized into scan groups (Quick Scan, Full Vulnerability Scan, Web Application Scan, Infrastructure Scan, SSL/TLS Audit) and individual checks (EternalBlue, Shellshock, Heartbleed, Struts RCE, SQL injection, XSS, etc.)
- **Profile Management**: Create custom profiles, clone existing ones (including built-in), edit/delete custom profiles
- **CVE Detection**: Automatic extraction of CVE identifiers from NSE script output with Vulners database integration
- **NSE Alert Types**: `nse_vulnerability` and `nse_cve_detected` alert types with severity classification, visible in Alerts page with NSE source filter
- **NSE Scanner Page**: New UI page with profile grid/list views, search, severity/platform/type filters, View/Clone/Run actions
- **NSE Results API**: Dedicated endpoints for NSE scan results with filtering by scan, severity, IP, and CVE
- **Built-in Profile Seeding**: 22 profiles automatically seeded on first startup — works out of the box without configuration
- **NSE Script Repository**: 612 NSE scripts synced from upstream nmap with manifest.json, GitHub Actions auto-sync workflow
- Agent-based host detection templates planned (user stories #33-#36 in PLANNED-FEATURES.md)

### Changed
- Scanner agent now supports three scanner types: masscan, nmap, and nse
- Scanner job system extended with NSE-specific fields (nse_scripts, nse_script_args) passed from profiles
- Docker images now include git for optional repository sync
- Alerts Source filter dropdown now includes NSE option

## [1.3.2] - 2026-03-20

### Changed
- Refreshed stale Markdown documentation to match the current scanner workflow, alert-state model, unified alert rules, and Docker-first development setup
- Restored a state diagram to the alert-state documentation while keeping the updated alert semantics accurate
- Expanded the refreshed docs with more architectural explanation and operational context without reverting to outdated behavior
- Unified alert rules: replaced separate `port_rules` and `global_port_rules` tables with a single `alert_rules` table supporting multiple alert sources (port, SSH, future TLS etc.)
- Alerts now carry a `source` field ("port" or "ssh") instead of inferring category from alert type prefix
- Alert `port` field is now nullable to support source types that don't have ports
- All routers (alerts, policy, hosts, ssh, networks, ports) migrated to use `alert_rules_service`
- SSH alerts can now be suppressed via accepted rules (previously only dismissable)
- Frontend category filter uses backend `source` field instead of heuristic type-prefix matching
- Alert Rules page now supports inline editing of existing rules on `/port-rules`

### Added
- User-editable severity override on alerts: clickable severity badge in both the alerts list and alert detail page lets users change severity (critical/high/medium/info) or reset to the computed default
- Severity overrides persist across new scans — new alerts for the same (type, ip, port) inherit the override from previous alerts
- `PATCH /api/alerts/{id}/severity` endpoint for updating severity override
- `severity_override` column on alerts table (migration 013)
- `alert_rules` table with `source`, `rule_type`, and `match_criteria` JSON column for source-specific matching
- Alembic migration `012_add_alert_rules_and_source` that creates the new table, backfills data from old tables, and adds `source` column to alerts

## [1.3.1] - 2026-03-04

### Added
- Auto-trigger discovery scan after first normal scan completes on a network that has never had a discovery scan (populates hosts list automatically)
- Dev Login button on login page for quick authentication during development (only visible in dev mode, stripped from production builds)
- Dedicated Port Rules page accessible from main navigation

### Changed
- Full terminology rename across all layers: `acknowledged` → `dismissed`, `ack_reason` → `dismiss_reason`, endpoints `/acknowledge` → `/dismiss`, `/unacknowledge` → `/reopen`, `/bulk-whitelist-*` → `/bulk-accept-*`, `/ack-suggestions` → `/dismiss-suggestions`
- DB migration renames `acknowledged` and `ack_reason` columns to `dismissed` and `dismiss_reason`
- Frontend labels updated: "Unacknowledged" → "Pending", component renames `AckModal` → `ReviewModal`, `AckSuggestions` → `ReasonSuggestions`

### Fixed
- Rule specificity resolution: IP-specific accepted rule now correctly overrides port-wide critical rule instead of showing both statuses
- Scan progress display limited to one decimal place
- Poll for planned scans restored, Scans nav tab restored, query param typo fixed

## [1.3.0] - 2026-03-04

### Added
- Bulk delete alerts: select alerts and permanently delete them with confirmation dialog (admin only)
- `CLAUDE.md` documentation file for AI assistant guidance covering project structure, development workflows, quality checks, and key conventions

### Fixed
- Global alerts not regenerated after deletion — the `is_new` guard on `global_open_ports` prevented re-alerting on previously seen ports even when the alert was deleted
- Duplicate `SSH_ALERT_TYPES` definition that shadowed the canonical one (missing `SSH_CONFIG_REGRESSION`)
- All pre-existing mypy type errors and ruff lint warnings across backend codebase

### Changed
- Renamed "Ack" button to "Accept" on alerts page
- Alert checkboxes now selectable for all alerts (not just dismissed)

## [1.2.0] - 2026-03-03

## [1.1.19] - 2026-02-24

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
  - Active alerts section with severity badges and quick-dismiss button, plus collapsible dismissed alerts
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
- Initial release of STYLiTE Orbit Monitor
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
