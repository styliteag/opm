# AGENTS.md - STYLiTE Orbit Monitor

Read this file fully before making changes.

## Dev Environment

All dev via Docker Compose. Do not restart unless specific reason — hot-reload via bind mounts.

| Container      | Port | URL                    |
|----------------|------|------------------------|
| `opm-backend`  | 8000 | http://localhost:8000  |
| `opm-frontend` | 5173 | http://localhost:5173  |
| `opm-db`       | 3306 | mysql://localhost:3306 |
| `opm-scanner`  | —    | (polls backend)        |
| `opm-scanner-gvm` | — | (GVM bridge, via `compose-gvm.yml`) |

**Credentials**: `admin@example.com` / `admin` — check `.env` or `compose-dev.yml` for overrides.

## Backend Conventions

**Architecture**: Routers → Services → Models (Pydantic schemas for validation)

### Database & ORM

- Use `TYPE_CHECKING` for circular import prevention in relationship type hints
- `mapped_column()` with `ForeignKey` needs explicit `index=True` for indexed FK columns
- Enum types inherit both `str` and `Enum` for proper serialization
- Use `selectinload()` for relationships — avoid async lazy-load errors
- Migration-first: Alembic migrations applied on startup. `create_all()` only as fallback
- Create migration: `docker exec opm-backend uv run alembic revision --autogenerate -m "desc"`

### Type Checking

- Strict mypy: always specify type params (`dict[str, Any]` not `dict`)
- Use `from jose.exceptions import JWTError` not `jwt.JWTError` for type stub compatibility
- Use `collections.abc.AsyncGenerator` (not `typing.AsyncGenerator`)

### Auth & Security

- JWT `HS256` — user tokens have `sub`/`email`/`role`, scanner tokens have `scope='scanner'` (15 min)
- API keys: `X-API-Key` header, bcrypt-hashed, `secrets.token_hex(32)`, returned only at creation
- DI deps: `CurrentUser`, `AdminUser`, `CurrentScanner`, `DbSession` from `core/deps.py`

### API Patterns

- `db.commit()` in router after service ops
- Nullable update fields: use explicit flags (`clear_schedule=True`) to distinguish "not updating" vs "clearing"
- List responses: wrapper schema with typed list field

### Service Layer

- Services return values or `None`; never raise HTTP exceptions
- `first_seen_at` tracking: query previous scans for existing ip:port records
- Excluded ports: network-wide entries have `ip=None`; scanner checks both ip-specific + port-only
- Scanner results accept RUNNING or CANCELLED scans; cancelled store partial results without status change
- Scheduled scans via APScheduler every minute; skip networks with planned/running scans
- Alerts deduped by `(alert_type, ip, port)` while not dismissed
- Alert sources: `port`, `ssh`, `nse`, `gvm` — each with distinct alert types
- Alert emails: resolve from network `alert_config.email_recipients` or `ALERT_EMAIL_RECIPIENTS`

## Frontend Conventions

- TanStack Router file-based routing in `src/routes/` (NOT `src/pages/`)
- Feature modules in `src/features/` — each has `components/`, `hooks/`, optionally `schemas/`
- API layer in `src/lib/` — `api.ts` (fetch wrapper), `api-client.ts` (typed functions)
- Auth token in `localStorage` under `opm-auth-token`
- `@/*` resolves to `src/*` — always use `@/` prefix for imports
- `import type` for type-only imports
- Named exports only, no default exports

## Scanner Conventions

- Registry pattern: **masscan** (port discovery), **nmap** (service detection), **nse** (vulnerability scripts), **greenbone/GVM** (vulnerability assessment)
- Masscan needs `NET_RAW` + `NET_ADMIN` Docker capabilities
- Port spec exclusions prefixed `!` → `--exclude-ports`; full range if only exclusions
- Logs batched via `threading_utils.py`, sent to `/api/scanner/logs` every ~5s
- IPv6: checks connectivity first, fails fast if unreachable
- Host discovery polls `/api/scanner/host-discovery-jobs` separately from scan jobs
- Hostname cache & enrichment architecture: see `docs/scanner/hostname-cache.md`

### Greenbone (GVM) Scanner

- Separate compose stack: `compose-gvm.yml` (runs alongside main OPM stack via shared `opm-network`)
- `opm-scanner-gvm` container bridges OPM ↔ GVM via `python-gvm` over Unix socket (`/run/gvmd/gvmd.sock`)
- Docker image: `Dockerfile.gvm` (no masscan/nmap — lightweight Python-only)
- `Scanner.kind` column (`"standard"` / `"gvm"` / `"unified"`) — set by admin at scanner creation or auto-detected by the scanner image on auth. `"unified"` means the scanner has both standard tools (masscan/nmap/nuclei) and a GVM socket, handling both job types. Existing scanners default to `"standard"` on migration 010
- Network `scanner_type` must be `"greenbone"` with a `gvm_scan_config` (and optional `gvm_port_list`) — both are **names** of library/built-in entries, never UUIDs
- Vulnerability results submitted to `POST /api/scanner/vulnerability-results` → stored in `vulnerabilities` table
- Alerts generated for findings at or above the network's `gvm_alert_severity` threshold (default medium when null): `gvm_vulnerability` (no CVEs) and `gvm_cve_detected` (has CVEs). Threshold is edited on the Network form's Greenbone block.
- Host detail page shows all GVM findings (including info/low) deduped by OID via `GET /api/hosts/{id}/vulnerabilities`
- First startup downloads GVM vulnerability feeds — takes significant time; monitor via `docker compose -f compose-gvm.yml logs -f gvmd`

#### GVM Library + Scanner Mirror

- **Library** (`gvm_config_library` table, admin-managed via `/admin/gvm-library`) holds user-uploaded scan config and port list XMLs with `UNIQUE(kind, name)` and a `xml_hash` column. Upload auto-extracts `<name>` from the XML; built-in names are rejected; size cap 5 MB.
- **Per-scanner mirror** (`gvm_scanner_metadata` table) is a live cache of what the scanner's GVM instance currently has. The `opm-scanner-gvm` agent posts full snapshots via `POST /api/scanner/gvm-metadata` on startup, every ~5 min while idle, and on-demand when `gvm_refresh: true` is piggybacked in the `/api/scanner/jobs` poll response (admin triggers via the scanner detail page).
- **Auto-deploy before scan**: `/api/scanner/jobs/{id}/claim` returns `required_library_entries` whose names resolve via library lookup. The scanner self-checks against its own `get_scan_configs()` / `get_port_lists()`, fetches missing/drifted XML via `GET /api/scanner/gvm-library?kind=...&name=...`, imports via `gmp.import_config` / `gmp.import_port_list`. Version drift is detected via an `[OPM:hash=<sha256>]` marker embedded in the GVM `<comment>` element on import.
- **Network resolution order** at scan claim: library → scanner-native mirror → fail fast. Built-in configs like "Full and fast" resolve via step 2 once the mirror is populated.

#### GVM / Nuclei Severity Rules (per-OID alert overrides)

- **Table** `gvm_severity_rules` (migration 023): `(oid, network_id)` unique, `network_id` nullable — null = global, set = network-scoped. Stores `severity_override` (info/low/medium/high/critical), optional `reason`, and `created_by_user_id`. Applies to both GVM OIDs and nuclei composite `template_id:matcher_name` keys (same `oid` column).
- **Resolution order** inside `_generate_gvm_alerts` (`app/services/vulnerability_results.py`): network rule → global rule → native severity. The resolved severity is what the network's `gvm_alert_severity` threshold is applied to, and is stored on the resulting `Alert.severity_override`. Alert messages include a `(severity promoted from X to Y via rule)` note when a rule fired. Nuclei alert generation does **not** currently consult overrides (only the GVM path does).
- **CRUD** via `/api/gvm-severity-rules` (operator+), upserts on `(oid, network_id)`. Admin list page at `/admin/gvm-severity-rules`.
- **UI entry points**: "Change alert severity" button on expanded GVM/nuclei rows in the host detail Vulnerabilities panel and the scan detail Vulnerabilities table. Dialog defaults to "All networks (global)" scope regardless of context; network scope is available when the caller supplies a `networkId` (scan page does, host page doesn't — a host can belong to multiple networks).
- **Intended workflow**: promote a noisy-but-benign info finding (e.g. DNS recursion OID `1.3.6.1.4.1.25623.1.0.147232`) to high so it reaches the alert layer, or demote a persistent medium nuisance to info to suppress it — without changing the network-wide `gvm_alert_severity` floor.

### Nuclei (post-phase vulnerability scanning)

- **Container**: bundled in the standard scanner image (`scanner/Dockerfile`) alongside masscan/nmap/nse. Multi-stage `COPY --from=projectdiscovery/nuclei:${NUCLEI_VERSION}` pins the binary; templates are refreshed at Docker build time via `nuclei -update-templates -ud /opt/nuclei-templates -duc`. Runtime template updates are disabled inside running containers (`-disable-update-check`). Does **not** live in the GVM container.
- **Eligibility**: `nuclei_enabled=True` is only accepted when `scanner_type ∈ {masscan, nmap}`. NSE networks (standalone vulnerability scanner) and Greenbone networks (different code path + different scanner kind) are excluded. A Pydantic model validator on `NetworkCreate`/`NetworkUpdate` rejects incompatible combos with a 422.
- **Phase composition** lives scanner-side in `_build_legacy_phases()` (`scanner/src/orchestration.py`): when `job.nuclei_enabled` and scanner_type is masscan/nmap, a `ScanPhase(name="vulnerability", tool="nuclei", ...)` is appended after the base port_scan phase. The `_run_vulnerability_phase` runner branches on `phase.tool` (`nmap_nse` vs `nuclei`).
- **Target selection** (`scanner/src/scanners/nuclei.py`): nmap networks filter open ports by a case-insensitive substring match on `service_guess` (`http` or `ssl`). Masscan networks have no service_guess, so they fall back to a hardcoded set of common web ports: `{80, 443, 8000, 8008, 8080, 8081, 8088, 8443, 8888, 9000, 9443}`. Targets are handed to nuclei as `IP:PORT` (no scheme) and nuclei's built-in HTTP detection handles scheme probing. Empty target list = phase no-op.
- **Result storage**: reuses `POST /api/scanner/vulnerability-results` with a new `source` field in `VulnerabilityResultData` (`"gvm"` default for back-compat; scanner sends `"nuclei"` per-finding). The `vulnerabilities.oid` column was widened to `VARCHAR(255)` in migration 011 and stores the composite `template_id:matcher_name` so distinct matcher variants stay distinct.
- **Alerts**: `NUCLEI_VULNERABILITY` / `NUCLEI_CVE_DETECTED` enum members added to `AlertType`. `_generate_nuclei_alerts()` mirrors `_generate_gvm_alerts()`: medium+ threshold (info/low silently stored but never alert-emitted), dedupe key `nuclei:{network_id}:{ip}:{port}:{protocol}:{composite_oid}`.
- **Failure isolation**: `_run_nuclei_phase()` wraps everything (subprocess, parse, submit) in try/except. A broken nuclei run logs a warning and never fails the surrounding scan. Missing nuclei binary logs a single info line at scanner startup and the phase short-circuits to empty.
- **Runtime knobs**: hardcoded nuclei defaults (rate-limit, concurrency, bulk-size) — only `nuclei_tags`, `nuclei_severity`, and `nuclei_timeout` (60–86400 s wall-clock; null → scanner default 7200) are configurable per-network. `subprocess.run(..., timeout=nuclei_timeout)` is the hard kill.

## Alert State Terminology

Alert state tracked across orthogonal dimensions. Naming differs between layers.

**DB columns**: `dismissed` (bool), `dismiss_reason` (text), `resolution_status` (open/in_progress/resolved), `assigned_to_user_id` (FK).

"Accepted" is **not** stored on alert — computed by matching against `port_rules`/`global_port_rules` (`rule_type='accepted'`).

| UI Label | Filter value | DB / API field | Endpoint |
|----------|-------------|----------------|----------|
| Pending Review | `'pending'` | `dismissed=false` | — |
| Dismissed | `'dismissed'` | `dismissed=true` | `PUT /alerts/{id}/dismiss` |
| Accepted | `'accepted'` | rule match (client-side) | `POST /alerts/bulk-accept-global` |
| Blocked | `'blocked'` | `severity='critical'` | — |
| Reopen | — | `dismissed=false` | `PUT /alerts/{id}/reopen` |
| Revoke Rule | — | deletes port rule row | `DELETE /api/port-rules/{scope}/{id}` |

**Key distinction**: Dismiss = `dismissed=true` (future scans still alert). Accept = `dismissed=true` + creates port rule (future scans won't alert).

## Release Process

1. `./release.sh [major|minor|patch]` — bumps VERSION, updates CHANGELOG, syncs NSE, commits, tags, pushes
2. Tag triggers GitHub Actions: typecheck, multi-arch Docker build, push to Docker Hub + GHCR
3. Images: `styliteag/opm` (combined), `styliteag/opm-scanner`, and `styliteag/opm-scanner-gvm`

## Gotchas

- Imports inside functions cause mypy strict mode issues — keep at top level
- When modifying models, also update related schemas + services
- Field names must match exactly between models, schemas, API responses
- Bulk ops: delete existing + create new in single transaction
- Validate nested resources belong to parent (`rule.network_id == network_id`)
- `hatchling` needs `[tool.hatch.build.targets.wheel]` in `pyproject.toml`

## Browser Testing

For any UI change: navigate to page, verify, screenshot if helpful. Frontend story NOT complete until browser verification passes.
