# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **SSH Alert Defaults**: dedicated admin page at `/admin/ssh-alert-defaults` (sidebar entry "SSH Defaults", `KeyRound` icon, admin-only). Replaces the embedded section on the Organization page. Toggles are grouped by topic (Anmeldung / Verschlüsselung / OpenSSH-Version / Änderungsüberwachung) with German help text under each switch. The version threshold input is labeled "Mindest-Version (nur OpenSSH)" and validates against `^\d+(\.\d+){1,2}$` both client- and server-side; non-OpenSSH implementations (Dropbear, libssh) are explicitly called out as not version-checked. New override banner shows "X Netzwerke überschreiben diese Defaults" with a link to a filtered networks list, plus a "Auf alle anwenden" button (with confirmation dialog) that strips the six SSH keys from every network's `alert_config` while preserving non-SSH keys like `email_recipients`. Two new admin endpoints back the page: `GET /api/settings/ssh-alert-defaults/overriding-networks` and `POST /api/settings/ssh-alert-defaults/apply-to-all`
- **Per-network SSH overrides**: NetworkForm now exposes a collapsible "SSH Alert Overrides" section under Schedule & Alerts. Each of the five SSH alert toggles is a tri-state select (`Vererben (global: An/Aus)` / `Erzwungen: An` / `Erzwungen: Aus`) and the version threshold has its own optional input — empty means "use global default". The form auto-expands the section when an existing network already has any SSH override set, and shows an "aktiv" badge in the section header. On submit, only non-`inherit` keys are written to `alert_config`; `inherit` keys are removed so the global defaults apply via the existing merge logic in `ssh_alert_generation.py`
- **Networks filter**: networks list at `/networks` now accepts `?filter=ssh-override` and shows only networks whose `alert_config` contains at least one of the six SSH keys, with a removable filter chip and "X von Y Netzen" counter at the top of the list. The link from the SSH Defaults page targets this filter. Coverage stat at the top of the page continues to reflect all networks regardless of filter
- **Nuclei scanner**: Nuclei (ProjectDiscovery) now runs as an opt-in post-phase after port discovery on networks with `scanner_type` in `masscan` or `nmap`. The nuclei binary is added to the standard scanner image via multi-stage `COPY --from=projectdiscovery/nuclei:${NUCLEI_VERSION}` and community templates are baked in at build time. New per-network fields `nuclei_enabled`, `nuclei_tags`, `nuclei_severity`, and `nuclei_timeout` (60–7200 s, null = scanner default 1800). Target selection: nmap networks filter by `service_guess` substring match on `http`/`ssl`; masscan networks fall back to a hardcoded common-web-ports list. Findings land in the existing `vulnerabilities` table with a new `source='nuclei'` discriminator; `vulnerabilities.oid` widened to `VARCHAR(255)` to hold the composite `template_id:matcher_name` so distinct matcher variants stay distinct. New alert types `nuclei_vulnerability` / `nuclei_cve_detected` fire on medium+ findings, mirroring GVM behavior. Failures in the nuclei phase are caught internally and never fail the surrounding scan
- **Nuclei scanner**: NetworkForm toggle "Vulnerability scanning (Nuclei)" reveals tag/severity/timeout config inline, auto-disables when switching scanner type to Greenbone, and is backend-validated via a Pydantic model validator on `NetworkCreate`/`NetworkUpdate`. Host detail vulnerabilities panel adds a Source badge per row (`GVM` indigo / `Nuclei` teal); alert filters and rule-source badges extended with Nuclei entries
- **GVM Library**: Scan Config viewer — new read-only dialog on `/admin/gvm-library` that parses uploaded scan config XML client-side and exposes an Overview tab (name, comment, type, family/NVT totals with `growing` flags), plus tabs for Families (NVT counts per family), Preferences (human-readable name, type, value, default per NVT preference) and NVT Selectors (include/exclude rules). Makes it practical to audit what a library entry actually contains without having to download and read raw XML
- **GVM Library**: Port List editor — new side-by-side TCP/UDP range editor on `/admin/gvm-library`. Supports viewing existing port lists, editing them in place (name is treated as the primary key and locked in edit mode, so saving overwrites the same library row), and creating new port lists from scratch. Range input accepts comma/whitespace/semicolon-separated tokens like `22,80,443,1000-2000`, auto-normalizes and merges overlapping/adjacent ranges, validates against 1-65535, and shows a live table of resolved ranges with per-range port counts. Presets for well-known ports, web-only, Nmap top 100, IANA 1-1023, All TCP and All TCP/UDP. On save the editor serializes a valid `<get_port_lists_response>` XML envelope and round-trips through the existing upload endpoint (upsert by `<name>`)
- **GVM Library**: View / Edit / New action buttons on the library table rows and a dedicated "New Port List" button in the Port Lists tab
- **Networks**: Clone button on each network card on `/networks` opens the Network form pre-populated with the source network's CIDR, port spec, scanner, schedule, phases, GVM scan config / port list, nuclei settings, and `alert_config`. Stays in create mode (no `update` mutation), seeds the name as `Copy of {original}`, and the dialog re-mounts per source so cloning a different network mid-session always picks up fresh defaults. No backend change — submission goes through the existing `POST /networks` create path

### Fixed

- **Frontend a11y**: form labels in `GlobalRuleAddForm`, `PortRulesEditor`, `HostComment`, `DismissModal`, `AcceptModal`, and the admin Organization page now use the shared `Label` component with explicit `htmlFor`/`id` pairs, so screen readers and keyboard users can target each input. Sortable column header buttons in the Alerts and Hosts tables and bare checkbox cells in the Hosts table received descriptive `aria-label`s; the icon-only "remove rule" button in `PortRulesEditor` is no longer unannounced
- **Frontend bug**: admin Organization page no longer calls `setState` during render. The form was wrapped in a child component that receives the loaded data as a prop and seeds local state in `useState`, eliminating the dual-render code path that the React 19 strict-mode lint rule flagged. Same pattern applied to the SSH Alert Defaults sub-section
- **Greenbone (GVM)**: scanner no longer spams `Could not push GVM metadata snapshot: ... [Errno 111] Connection refused` warnings during gvmd cold boot. The shared `gvmd_socket_vol` makes the socket file visible inside the `opm-scanner-gvm` container as soon as gvmd mounts it, but gvmd often does not `listen()` on it for several seconds (or minutes during feed sync) — every connect attempt in that window failed with `ECONNREFUSED` and dumped a full GMP-handshake traceback. Two new mitigations: (1) a lightweight `_wait_for_gvmd()` raw-socket probe runs before the cold-boot GMP push, polls with exponential backoff (2 → 10 s, max 60 attempts), and only proceeds once the socket actually accepts connections; (2) the background metadata pulse now anchors `last_gvm_metadata_push` to the current monotonic time on every attempt regardless of success, so a failing push waits the full `GVM_METADATA_PULSE_INTERVAL` (5 min) before retrying instead of firing on every 60 s poll cycle. Net effect: at most one info-level "waiting for gvmd" line during cold boot, and at most one warning per 5 min during a sustained gvmd outage

### Changed

- **Frontend refactor**: `NetworkForm.tsx` (825 lines) split into `NucleiSettings.tsx`, `GvmConfigSection.tsx`, and a shared `networkFormSchema.ts`. The form is now wrapped in `FormProvider` so sub-components consume `useFormContext` instead of having `register`/`errors` drilled through props. NetworkForm itself drops to ~588 lines; behavior, validation, payload shape, and visual layout for masscan/nmap are unchanged. Greenbone path moves the GVM Scan Config dropdown out of the 3-column scanner grid into its own row inside the new `GvmConfigSection` to give long config names more horizontal room
- **Frontend refactor**: `ProfileEditModal.tsx` (632 lines) split into a thin parent (~187 lines) and a self-contained `ScriptSelector.tsx` that owns the search/filter/group-by-protocol UI plus the `useNseScripts` query. Parent passes `selected: Set<string>` and `onChange` only. The shared `getProtocol()` helper moved to `features/nse/lib/scriptProtocol.ts` to satisfy `react-refresh/only-export-components`
- **Frontend perf**: `AlertsTable` and `HostsTable` column definitions are now memoized with `useMemo` so TanStack Table doesn't rebuild ColumnDef arrays on every parent re-render
- **Frontend UX**: `ScriptUploadModal` resets the underlying file input via ref on successful upload, so users can re-pick a file with the same filename without reloading the page
- **Frontend cleanup**: removed bespoke `inputClass` Tailwind constant and raw `<input>`/`<textarea>`/`<button>` elements from the admin Organization page in favor of the shared `Input`, `Textarea`, `Button`, and `Label` components — also drops the `font-medium` (500 weight) usages that fell outside the design system's 400/510/590 scale
- **Admin Organization page**: SSH Alert Defaults section removed from `/admin/organization` and moved to its own dedicated page at `/admin/ssh-alert-defaults` (see Added). The Organization page is now focused purely on org-level metadata (name, description, contact email, logo URL, security policy URL)
- **Greenbone (GVM)**: new per-network `gvm_keep_reports` flag (default `true`) controls whether the scanner deletes the GVM task/target/report after a scan completes. Previously the scanner always ran `delete_task(..., ultimate=True)` + `delete_target(..., ultimate=True)` in a `finally` block, which purged everything — including the report — from the Greenbone instance as soon as findings were submitted back to OPM. Default flips to keep so scans remain inspectable in the GSA web UI; users who want the old auto-cleanup can uncheck the new checkbox on the Greenbone block of the Network form. Migration `012_add_gvm_keep_reports.py` adds the column with `server_default='1'`; existing networks auto-upgrade to the new "keep" behavior. Wired through `NetworkCreate`/`NetworkUpdate` schemas, `networks` service, `/api/scanner/jobs` payload, scanner `ScannerJob` dataclass, and `GreenboneScanner.run_scan(keep_reports=...)`
- **Networks**: Edit/Create Network form now hides the Protocol select when scanner type is Greenbone (GVM) — `scan_protocol` is only consumed by masscan/nmap/NSE; GVM derives TCP/UDP from the selected Port List (library/mirror) or from `port/tcp` tokens in the raw Port Specification, so exposing the dropdown was misleading. Rate, Scan Timeout, Port Timeout, Phases and NSE Profile were already hidden for Greenbone



## [2.1.0] - 2026-04-10

### Fixed

- **Greenbone (GVM)**: scanner version now reported correctly instead of `unknown` — `compose-gvm.yml` mounts `./VERSION:/app/VERSION:ro` into `opm-scanner-gvm` the same way `compose-dev.yml` does for the standard scanner, so `get_version()` reads the real version file instead of falling back to the Dockerfile build arg default
- **Greenbone (GVM)**: GSA web UI no longer segfaults on 24.10 — rewrote `compose-gvm.yml` to use the upstream three-part pattern (`gsa` static assets → `gsad` API daemon → `nginx` frontend/proxy) instead of running the legacy monolithic `gsa:stable` image as a daemon
- **Greenbone (GVM)**: nginx front-end no longer crash-loops with `host not found in upstream "gsad:80"` — custom `docker/gvm-nginx.conf` now uses Docker's embedded DNS resolver (`127.0.0.11`) with a variable in `proxy_pass`, forcing runtime resolution instead of the one-shot startup lookup that `upstream { server gsad:80; }` performs

### Changed

- **Greenbone (GVM)**: `compose-gvm.yml` aligned with upstream volume naming (`*_vol` suffix) and project name `greenbone-community-edition`
- **Greenbone (GVM)**: documented ghcr.io mirror as a commented-out alternative next to each image (community registry remains the default since ghcr.io does not publish every image)
- **Docs**: clarified `opm-network` is only required in the dev compose setup

### Added

- **Scanners**: Scanner detail page now has an "Edit" button opening a modal to change name, description, location, and kind (standard/gvm); scanner list page shows a new "Type" column with a GVM / Standard badge, and the detail header shows kind + location alongside status
- **Scanners**: Scanner agent now self-reports its kind (`standard` / `gvm`) in the `/api/scanner/auth` request body (detected via presence of `masscan` / `gvmd` socket); backend accepts it as authoritative and updates `Scanner.kind` on auth, logging any drift from the admin-configured value. Version column now renders as `2.0.1 (gvm)` / `2.0.1 (std)` on both list and detail pages via a new `formatScannerVersion()` helper
- **Greenbone (GVM)**: `.env.example` now lists all `GVM_*` variables (`GVM_SCANNER_API_KEY`, `GVM_BACKEND_URL`, `GVM_POLL_INTERVAL`, `GVM_LOG_LEVEL`, `GVM_USER`, `GVM_PASSWORD`, `GVM_GSA_PORT`, `GVM_GSA_HTTPS_PORT`)
- **Greenbone (GVM)**: GVM config library with auto-deploy on scan — admins can upload exported `<get_configs_response>` / `<get_port_lists_response>` XMLs via `/admin/gvm-library`; the scanner agent self-checks on scan claim and imports missing or drifted entries before running `create_target`. Version drift detected via an `[OPM:hash=<sha256>]` marker embedded in the GVM `<comment>` element.
- **Greenbone (GVM)**: `Scanner.kind` column (`"standard"` / `"gvm"`) picked at scanner creation — Scanner detail page now shows GVM Scan Configs and GVM Port Lists tabs for GVM scanners with a manual "Refresh metadata" trigger that piggybacks on the existing `/api/scanner/jobs` poll.
- **Greenbone (GVM)**: GVM port list selection on networks — new `gvm_port_list` field and network form dropdown. When set, the scanner passes `port_list_id` to `gmp.create_target` instead of the raw `port_range` string, using GVM's native port list system.
- **Greenbone (GVM)**: Per-network `gvm_scan_config` and `gvm_port_list` dropdowns now populate dynamically from the OPM library ∪ the currently-assigned scanner's live mirror (`gvm_scanner_metadata`), replacing the previous hardcoded 4-option list.

### Migration

- **Alembic 010**: adds `scanners.kind` (default `"standard"`), `scanners.gvm_refresh_requested`, `scanners.gvm_synced_at`, `networks.gvm_port_list`, `gvm_config_library` table, `gvm_scanner_metadata` table. Existing GVM scanners must be manually edited to `kind="gvm"` post-upgrade via the scanner edit form, otherwise the GVM tabs and metadata loop will remain inactive.

## [2.0.0] - 2026-04-10

### Added

- **Greenbone (GVM)**: GSA web UI service in `compose-gvm.yml` (port 9392, configurable via `GVM_GSA_PORT`)
- **Docs**: GVM admin password setup and GSA web UI instructions in README

### Fixed

- **Backend**: ruff line length and import sort violations in vulnerability service and migration

### Changed

- **Backend**: introduce repository pattern (`BaseRepository[T]`) for data access abstraction, migrate 9 services to use it
- **Backend**: decompose `alert_queries.py` (542 lines, 8 responsibilities) into `AlertRepository`, `alert_state.py`, and `alert_auto_dismiss.py`
- **Frontend**: extract host detail page sub-components (InlineHostname, HostComment, PortsTab, AlertsTab, ScansTab, SshTab) into `features/hosts/components/`, reducing route file from 810 to ~230 lines

### Added

- **Greenbone (GVM)**: alert generation from GVM vulnerability results (medium+ severity), with `gvm_vulnerability` and `gvm_cve_detected` alert types
- **Greenbone (GVM)**: GVM source and type filters on /alerts page
- **Greenbone (GVM)**: GVM vulnerability results on host detail page (all severities incl. info/low), deduped by OID
- **Greenbone (GVM)**: `opm-scanner-gvm` added to CI release workflow (Docker Hub + GHCR, multi-arch)
- **Greenbone (GVM)**: new scanner type with dedicated `opm-scanner-gvm` container, `python-gvm` bridge, and `compose-gvm.yml`
- **Greenbone (GVM)**: `vulnerabilities` table + model for storing GVM scan findings (CVSS, OID, QoD, solution)
- **Greenbone (GVM)**: `POST /api/scanner/vulnerability-results` and `GET /api/scans/{scan_id}/vulnerabilities` endpoints
- **Greenbone (GVM)**: `gvm_scan_config` field on Network model (Full and fast, Full and deep, Discovery, System Discovery)
- **Greenbone (GVM)**: VulnerabilitiesTable component on scan detail page with severity badges and expandable rows
- **Greenbone (GVM)**: NetworkForm updated with greenbone scanner type option and GVM config dropdown
- **Greenbone (GVM)**: documentation in README.md (setup, env vars, architecture), CLAUDE.md, and AGENTS.md

### Changed

- **Greenbone (GVM)**: `compose-gvm.yml` defaults to build from source (dev); published image commented out for prod

### Fixed

- **Greenbone (GVM)**: VulnerabilitiesTable colors broken — `text-primary`/`text-secondary`/`text-tertiary`/`text-quaternary` resolved to wrong values (brand indigo, invisible, undefined); migrated to design system tokens
- **Hosts**: N+1 query in host list, CSV export, and PDF export — replaced per-host `get_open_port_count_for_host()` loop with single batch `GROUP BY` query

## [1.11.3] - 2026-04-09

### Fixed

- **Networks**: scanner_type change not syncing to phases — frontend-sent phases overwrote backend sync

## [1.11.2] - 2026-04-09

### Changed

- **NSE**: expand High Risk Scan profile from 23 to 31 scripts — add `ssl-dh-params`, `ftp-vuln-cve2010-4221`, `http-vuln-cve2011-3192`, `http-vuln-cve2017-1001000`, `http-vuln-cve2017-8917`, `rdp-vuln-ms12-020`, `smtp-vuln-cve2010-4344`, `ssh-vuln-cve2018-15473`, and `vulners.showall` script args

## [1.11.1] - 2026-04-09

### Changed

- **Alerts**: remove `resolution_status` field (full vertical removal: DB, API, UI)
- **Alerts**: severity counters in header now show totals across all matching alerts, not just current page
- **Alerts**: replace auto-polling (30s) with manual Refresh button
- **Alerts**: export CSV/PDF now respects current filter state
- **Alerts**: replace native `confirm()` dialogs with styled DeleteConfirmModal showing severity breakdown
- **Alerts**: comment indicator (chat bubble) in alerts table shows styled tooltip with author and preview
- **Alerts**: add Related SSH Alerts card on alert detail page
- **Alerts**: add "Clear filters" button and active filter dot indicators on filter dropdowns
- **Alerts**: show dismiss suggestions for bulk dismiss (general suggestions without port filter)
- **Alerts**: replace StatusBadge with dismissed indicator on host detail alerts tab
- Recurrence detection now reopens all dismissed alerts (not just formerly "resolved") when ports reappear

### Removed

- `resolution_status` column, enum, API endpoint (`PATCH /alerts/{id}/status`), and all frontend UI
- `PUT /alerts/bulk-reopen` endpoint and frontend `bulkReopen` mutation (dead code)
- `AlertStatusRequest`, `AlertBulkReopenRequest`, `AlertBulkReopenResponse` schemas

### Added

- `severity_counts` field in `AlertListResponse` for accurate header counters
- Alembic migration `006_remove_resolution_status` to drop the column
- `DeleteConfirmModal` component for styled delete confirmations
- Refactor CLAUDE.md and AGENTS.md for progressive disclosure (940 → 170 lines, 82% reduction)
- Move design system tokens to `.claude/rules/design-system.md`
- Add workflow orchestration rules in `.claude/rules/workflow.md`

## [1.11.0] - 2026-04-09

### Security

- Fix CORS wildcard: use configured `cors_origins` instead of hardcoded `["*"]`
- Reject scanner-scoped JWT tokens in user authentication (`get_current_user`)
- Add rate limiting (10 req/min/IP) to `/api/auth/login` endpoint
- Require authentication on `/api/version` and `/api/metadata/*` endpoints
- Refuse backend startup with default JWT secret in non-debug mode
- Disable Swagger/ReDoc/OpenAPI endpoints in production (non-debug) mode
- Add security headers to nginx (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- Remove hardcoded fallback credentials from DevLoginButton — require env vars
- Separate `DATABASE_ECHO` setting from `DEBUG` flag to prevent SQL query logging when debug mode is enabled
- Add `is_active` field to User model — deactivated users are rejected at auth with 403
- Admin can activate/deactivate users from the user management page (cannot deactivate self)
- Add `token_version` to User model — logout and password change immediately invalidate all existing tokens
- Increase default JWT TTL from 60min to 8h (configurable via `JWT_EXPIRATION_MINUTES`)

## [1.10.0] - 2026-04-09

### Added

- Trends page redesign: summary stat cards with delta indicators, area charts with gradients in 2x2 grid, resolution rate chart, clickable cards navigating to hosts/alerts
- Network detail dashboard: health stat cards (hosts, alerts, ports, scan success rate), alert trend chart, scanner status badge, tabbed layout (overview/configuration/scans)
- Scanner detail page: new route `/scanners/$scannerId` with stat cards (networks, scans, success rate, avg duration), assigned networks table, recent scans table
- Scanner list: scanner names are now clickable links to detail page
- Alert rules: hit count column showing how many dismissed alerts matched each rule, plus summary stats (total rules, active, total hits)
- Host detail: risk score sparkline showing 14-day trend next to risk score number
- Host detail: "New" badge on ports first discovered within the last 7 days
- Backend endpoints: `GET /api/networks/{id}/overview`, `GET /api/scanners/{id}/overview`, `GET /api/hosts/{id}/risk-trend`

### Fixed

- Migration status incorrectly showing "behind" for non-sequential Alembic revision IDs
- Renamed migration `3c597f90f9a7` to `003` to maintain sequential naming convention
- Trends page weekly aggregation 500 error: replaced `DATE_SUB` with `SUBDATE` for MariaDB integer-days compatibility
- Active Alerts stat card now shows active (non-dismissed) count matching the alerts list page
- ThreatPulseChart ResponsiveContainer negative dimension warning on dashboard

## [1.9.13] - 2026-04-08

### Added

- Cross-entity navigation links throughout the UI:
  - Alerts table: IP links to host detail, network name links to network detail
  - Alert detail: target IP and network name are now clickable links
  - Host detail: network names in header link to network detail
  - Scan detail: network name links to network detail, IPs in port table link to hosts
  - Network detail: "View Hosts" and "View Scans" quick-link buttons
  - Alert rules table: network scope links to network detail
- Hosts page accepts URL search params (`search`, `network_id`)
- Scans page accepts URL search params (`network_id`)

## [1.9.12] - 2026-04-08

### Added

- Port-specific filter input on alert rules page for quick port number lookup
- Link from each alert rule to matching dismissed alerts list (filtered by source, port, network)
- Alerts page now accepts URL search params for pre-filtering (source, port, network_id, severity, type, search)

### Fixed

- Alert rules table performance: stabilized column definitions with refs to prevent full re-renders on selection changes

### Changed

- Renamed "Port Rules" to "Alert Rules" throughout the frontend (route `/port-rules` → `/alert-rules`, feature directory, sidebar)
- Replaced section-based rule list with a TanStack Table featuring sortable columns, global search, inline editing (description, rule type, enabled toggle), and row selection

### Removed

- Removed legacy `RuleSection` and `RuleRow` components (replaced by `AlertRulesTable`)

## [1.9.11] - 2026-04-06

### Fixed

- Bulk delete alerts endpoint now uses POST method (was DELETE, causing 405 errors from frontend)
- Bulk dismiss alerts endpoint path changed from `/dismiss-bulk` (PUT) to `/bulk-dismiss` (POST) to match frontend expectations

## [1.9.10] - 2026-04-06

## [1.9.9] - 2026-04-06

### Added

- Custom Scan dialog on host detail page with scan mode selector (Port Scan / NSE Vulnerability)
- NSE profile picker in custom scan dialog when NSE mode is selected
- Per-scan parameter overrides stored on scan record (scan_overrides JSON column)

### Fixed

- Rescan button on host detail page now triggers a rescan instead of being a no-op
- NSE scanner now filters scripts to only those available on the system, preventing "failed to initialize the script engine" errors when the profile contains scripts not shipped with the installed nmap version

## [1.9.8] - 2026-04-06

### Fixed

- Page size "All" option no longer exceeds API max limit of 200
- Moved page size selector above alerts table next to filters
- Host timeline 500 error on MariaDB caused by SQLite-only `||` concatenation syntax

## [1.9.7] - 2026-04-06

## [1.9.6] - 2026-04-05

### Added

- Total alert count shown in alerts list pagination
- Page size selector (50/100/All) on alerts list
- Sortable Port column in alerts table
- Exact port filter input on alerts page for precise port matching
- Source filter dropdown on alerts page to filter by alert origin (Port, SSH, NSE)
- Backend `total` field in alert list API response

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
