# AGENTS.md - STYLiTE Orbit Monitor

Read this file fully before making changes.

## Project Overview

STYLiTE Orbit Monitor — distributed network port scanning + monitoring system. Three Docker components:

- **Backend** (`backend/`) — FastAPI REST API (Python 3.12, async)
- **Frontend** (`frontend/`) — React + Vite web dashboard (TypeScript)
- **Scanner** (`scanner/`) — Masscan/Nmap/NSE-based network scanner agent (Python 3.12)

Version: see `VERSION` file (semver). Database: MariaDB 11.

## Repository Structure

```
opm/
├── backend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/          # Config, database, security, dependencies, permissions
│   │   │   │   ├── config.py         # Settings from env vars (db, jwt, smtp, etc.)
│   │   │   │   ├── database.py       # SQLAlchemy async engine, session mgmt, schema init
│   │   │   │   ├── deps.py           # DI: CurrentUser, AdminUser, CurrentScanner, DbSession
│   │   │   │   ├── security.py       # JWT/API key auth, password hashing
│   │   │   │   ├── permissions.py    # RBAC permission checking
│   │   │   │   ├── alert_types.py    # Alert type registry
│   │   │   │   ├── scanner_types.py  # Scanner type registry (masscan, nmap, nse)
│   │   │   │   └── version.py        # Version file reader
│   │   │   ├── models/        # SQLAlchemy ORM models (22 models)
│   │   │   ├── routers/       # FastAPI route handlers (21 routers)
│   │   │   ├── schemas/       # Pydantic request/response schemas (19 schema modules)
│   │   │   ├── services/      # Business logic layer (31 service modules)
│   │   │   └── main.py        # App entry point, lifespan, router registration
│   │   └── migrations/versions/  # Alembic migration files
│   ├── scripts/               # init_admin.py, wait-for-db.py
│   ├── tests/                 # pytest async tests (SQLite in-memory)
│   ├── pyproject.toml         # Dependencies, mypy/ruff/pytest config
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── routes/            # TanStack Router file-based routing
│   │   │   ├── __root.tsx            # HTML shell
│   │   │   ├── login.tsx             # Public login page
│   │   │   ├── _authenticated.tsx    # Auth guard layout
│   │   │   └── _authenticated/       # Protected routes
│   │   │       ├── index.tsx                # Dashboard
│   │   │       ├── networks/                # Networks list + detail
│   │   │       ├── hosts/                   # Hosts list + detail
│   │   │       ├── alerts/                  # Alerts list + detail
│   │   │       ├── scans/                   # Scans list + detail
│   │   │       ├── scanners.tsx             # Scanner registration
│   │   │       ├── alert-rules.tsx           # Unified alert rules
│   │   │       ├── trends.tsx               # Trend charts
│   │   │       ├── nse/                     # NSE profiles, library, editor, results
│   │   │       └── admin/                   # Users, roles, organization (admin-only)
│   │   ├── features/          # Feature modules (domain-organized)
│   │   │   ├── admin/         # User, role, organization management
│   │   │   ├── alerts/        # Alert lifecycle, filtering, comments, assignment
│   │   │   ├── auth/          # Login, current user, JWT storage
│   │   │   ├── dashboard/     # Stats, scanner status, threat pulse, upcoming scans
│   │   │   ├── hosts/         # Host table, global ports, enriched port table, SSH inline
│   │   │   ├── networks/      # Network CRUD, alert rules editor, NSE profile selection
│   │   │   ├── nse/           # NSE profile/script CRUD, results browsing
│   │   │   ├── scanners/      # Scanner registration, API key management
│   │   │   └── scans/         # Quick scan, diff view, logs, CSV/PDF export
│   │   ├── components/        # Shared UI components (ui/, layout/, data-display/, feedback/)
│   │   └── lib/               # API client, types, query client, utilities
│   │       ├── api.ts                # Fetch wrapper with auth header injection
│   │       ├── api-client.ts         # Typed API client functions
│   │       ├── api-types.ts          # API response type definitions
│   │       ├── query-client.ts       # TanStack Query client config
│   │       ├── types.ts              # Domain type definitions
│   │       ├── risk-score.ts         # Host risk score calculation
│   │       ├── scan-estimate.ts      # Scan duration estimation
│   │       └── utils.ts              # Formatting, date helpers
│   ├── package.json           # Dependencies, scripts
│   ├── tsconfig.json          # Strict TypeScript config
│   ├── eslint.config.js       # ESLint + Prettier config
│   └── vite.config.ts         # Vite + Vitest config
├── scanner/
│   ├── src/
│   │   ├── scanners/          # Scanner implementations
│   │   │   ├── base.py               # Abstract base class
│   │   │   ├── masscan.py            # High-speed port scanner
│   │   │   ├── nmap.py               # Service detection + banner grabbing
│   │   │   ├── nse.py                # NSE vulnerability scripts
│   │   │   └── registry.py           # Scanner type registry pattern
│   │   ├── main.py            # Scanner entry point, job polling loop
│   │   ├── client.py          # Backend API client
│   │   ├── models.py          # Pydantic models (ScannerJob, OpenPortResult, etc.)
│   │   ├── orchestration.py   # Scan job orchestration
│   │   ├── ssh_probe.py       # SSH security probing
│   │   ├── discovery.py       # Host discovery via nmap/masscan ping
│   │   ├── hostname_enrichment.py  # DNS reverse lookups
│   │   ├── script_cache.py    # NSE script caching with ETag support
│   │   └── threading_utils.py # Log buffering (batched submission)
│   └── tests/
├── nse-templates/             # NSE script repository (613+ scripts synced from nmap)
│   ├── scripts/               # .nse script files
│   └── tools/                 # sync-from-nmap.sh and utilities
├── docker/                    # Nginx config, startup scripts for production
├── docs/                      # API reference, scanner docs, development guides
├── .github/workflows/         # CI: release.yml (tag-triggered Docker builds)
├── compose-dev.yml            # Development Docker Compose
├── compose.yml                # Production Docker Compose
├── Dockerfile                 # Multi-stage production build (frontend + backend + nginx)
├── CHANGELOG.md               # Keep a Changelog format — MUST be updated with every commit
└── VERSION                    # Semver version file
```

## Development Environment

### Starting Services

All dev runs through Docker Compose. **Never run frontend or backend directly outside Docker.**

```bash
docker compose -f compose-dev.yml up --build
```

User mostly already done this — **do not restart services** unless specific reason. Source changes hot-reloaded via bind mounts.

Use `docker exec -it <container-name> bash` to inspect/debug running containers.

### Container Names and Ports

| Container      | Port | URL                        |
|----------------|------|----------------------------|
| `opm-backend`  | 8000 | http://localhost:8000      |
| `opm-frontend` | 5173 | http://localhost:5173      |
| `opm-db`       | 3306 | mysql://localhost:3306     |
| `opm-scanner`  | —    | (polls backend internally) |

### Default Credentials

- **Admin**: `admin@example.com` / `admin` (from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars)
- **Database**: `opm` / `opmpassword` (from `DB_USER`/`DB_PASSWORD` env vars)
- Check `.env` or `compose-dev.yml` for overrides.

### Hot Reload

Source bind mounts enable hot-reload:
- `backend/src` → `/app/src` (uvicorn auto-reload)
- `frontend/src` → `/app/src` (Vite HMR)
- `scanner/src` → `/app/src` (Python auto-reload)

No need to rebuild/restart containers after code changes.

## Quality Checks (Required Before Every Commit)

### Backend (Python)

```bash
# Via Docker (preferred when containers are running):
docker exec opm-backend uv run mypy src/           # Type checking (strict mypy + Pydantic plugin)
docker exec opm-backend uv run ruff check src/      # Linting (ruff — E, F, I, W rules, 100 char)
docker exec opm-backend uv run pytest               # Tests (pytest-asyncio, SQLite in-memory)

# Locally (from backend/ directory):
cd backend
uv run --extra dev mypy src/                        # mypy is in [project.optional-dependencies] dev
uv run ruff check src/                              # ruff is a direct dependency
uv run --extra dev pytest                           # pytest is in dev extras
```

### Frontend (TypeScript)

```bash
# Via Docker (preferred when containers are running):
docker exec opm-frontend bun run typecheck          # Type checking (strict TypeScript)
docker exec opm-frontend bun run lint               # Linting (ESLint + Prettier)
docker exec opm-frontend bun run test               # Tests (Vitest + React Testing Library + jsdom)

# Locally (from frontend/ directory — requires npm install first):
cd frontend
npm install                                         # needed once; tsc is NOT globally available
npm run typecheck                                   # runs: tsc --noEmit
npm run lint                                        # runs: eslint .
npm run build                                       # runs: tsc -b && vite build (full build check)
npm run test                                        # runs: vitest run
```

**Important**: Do NOT use `npx tsc` — it fails. Always use `npm run typecheck` or `npm run build`.

### Scanner (Python)

```bash
# Type checking
docker exec opm-scanner uv sync --all-extras && uv run mypy src/
```

**All commits must pass typecheck, lint, tests. No broken code commits.**

## Changelog Requirement

**IMPORTANT: Every commit MUST update `CHANGELOG.md`.**

Add entries under `## [Unreleased]` using Keep a Changelog categories:
- `### Added` — new features
- `### Fixed` — bug fixes
- `### Changed` — changes to existing functionality
- `### Deprecated` — soon-to-be removed features
- `### Removed` — removed features
- `### Security` — security fixes

Keep entries concise but descriptive. Reference issue numbers when applicable.
**No code change without updating CHANGELOG.md.**

## Backend Conventions

### Architecture Pattern

Routes → Services → Models (Pydantic schemas for validation)

- **Routers** (`routers/`): 21 thin HTTP handlers, delegate to services, call `db.commit()` after service ops
  - `auth`, `alerts`, `global_ports`, `global_settings`, `host_timeline`, `hosts`, `metadata`, `networks`, `nse`, `organization`, `policy`, `ports`, `roles`, `scanner`, `scanners`, `scans`, `ssh`, `trends`, `users`, `version`
  - Plus `/health` endpoint on app directly
- **Services** (`services/`): 31 business logic modules, no HTTP concerns
- **Models** (`models/`): 22 SQLAlchemy 2.0 models with `Mapped[]` + `mapped_column()`
- **Schemas** (`schemas/`): 19 Pydantic v2 modules with `model_validate()` and `from_attributes=True`

### Database & ORM

- Use `TYPE_CHECKING` for circular import prevention in relationship type hints
- `mapped_column()` with `ForeignKey` needs explicit `index=True` for indexed FK columns
- Use `str | None` union syntax for nullable `Mapped[]` fields
- Enum types inherit both `str` and `Enum` for proper serialization
- Use `selectinload()` for relationships — avoid async lazy-load errors

### Database Schema Initialization

- Schema initialized on startup in `main.py` lifespan before admin user creation
- **Migration-first**: If Alembic migrations exist in `backend/src/migrations/versions/`, applied on startup
- **Fallback**: No migrations → schema created from SQLAlchemy models via `Base.metadata.create_all()`
- **Creating migrations**:
  1. Create: `docker exec opm-backend uv run alembic revision --autogenerate -m "description"`
  2. Review generated file in `backend/src/migrations/versions/`
  3. Applied on next startup
- `create_all()` only creates missing tables, won't modify existing. Always use migrations for schema changes.
- Files numbered sequentially (001_, 002_, etc.)

### Type Checking

- Strict mypy: always specify type params (e.g., `dict[str, Any]` not `dict`)
- Use `from jose.exceptions import JWTError` not `jwt.JWTError` for type stub compatibility
- Add `types-python-jose` and `types-passlib` to dev deps for mypy
- Use `collections.abc.AsyncGenerator` for async generator hints (not `typing.AsyncGenerator`)

### Authentication & Authorization

- JWT auth with `HS256`
- User tokens: `sub` = user ID, `email`, `role` in payload
- Scanner tokens: `sub` = scanner ID, `scope` = "scanner" (short-lived, 15 min)
- API keys: `X-API-Key` header, bcrypt-hashed, returned only at creation
- Rate limiting: in-memory sliding window with `threading.Lock`
- Use `CurrentUser`, `AdminUser`, `CurrentScanner`, `DbSession` from `core/deps.py`
- `AdminUser` returns 403 for non-admin users
- `CurrentScanner` validates scanner JWT scope

### Security

- Use `secrets.token_hex(32)` for 64-char API keys (32 bytes = 64 hex chars)
- Reuse `hash_password/verify_password` from security module for API key hashing (bcrypt)
- Return API key only once at creation; store only hash

### API Patterns

- List responses: create wrapper schema (e.g., `UserListResponse`) with typed list field
- Nested resources can share same router file
- Call `db.commit()` in router after service ops — ensure transaction completes
- Nullable optional update fields: use explicit flags (e.g., `clear_schedule=True`) to distinguish "not updating" vs "clearing"
- `HTTPBearer` provides credentials via `HTTPAuthorizationCredentials`
- CORS: `list[str]` origins, parsed from comma-separated env var
- FastAPI middleware via `app.add_middleware()`
- Pydantic-settings `SettingsConfigDict` handles `.env` loading
- FastAPI lifespan contextmanager preferred over deprecated `@app.on_event("startup")`

### Validation

- Use `ipaddress.ip_network` with `strict=False` for CIDR validation
- Port spec: parse comma-separated segments, handle ranges (80-443), handle exclusions (!88)
- Cron validation: check 5-6 fields + basic pattern matching
- Use Pydantic `field_validator` for custom validation + enum-like string fields before DB conversion

### Service Layer Patterns

- Check duplicate email on user create/update — return meaningful errors
- `first_seen_at` tracking: query previous scans of same network for existing ip:port records
- Excluded ports: network-wide entries have `ip=None`; scanner checks both ip-specific + port-only exclusions
- Scanner results accept RUNNING or CANCELLED scans; cancelled submissions store partial results without status change
- Job claiming: check running status before planned scans — return correct 409 vs 404
- Scheduled scans created by APScheduler job every minute; skip networks with planned/running scans
- Bulk ops: delete existing + create new in single transaction
- Validate nested resources belong to parent (e.g., `rule.network_id == network_id`)
- Port rules can include optional `ip`; alert evaluation merges global + IP-specific ranges
- Alerts include `network_id`, deduped by `(alert_type, ip, port)` while not dismissed
- Alert email recipients: resolve from network `alert_config.email_recipients` (or `recipients`) or `ALERT_EMAIL_RECIPIENTS`; UI links use `WEB_UI_URL`

## Frontend Conventions

### Tech Stack

- React 18, Vite, TypeScript (strict mode)
- TanStack Router (file-based), TanStack Query for server state
- React Hook Form + Zod for forms
- Tailwind CSS
- Context API for auth (`AuthContext`) + theme (`ThemeContext`)

### Architecture

- **File-based routing** in `src/routes/` via TanStack Router (NOT `src/pages/`)
  - `__root.tsx` — HTML shell
  - `_authenticated.tsx` — auth guard layout (replaces `ProtectedRoute`)
  - `_authenticated/` — all protected routes nested under auth guard
- **Feature modules** in `src/features/` — domain-organized (admin, alerts, auth, dashboard, hosts, networks, nse, scanners, scans)
  - Each: `components/`, `hooks/`, optionally `schemas/`
- **Shared components** in `src/components/` — `ui/`, `layout/`, `data-display/`, `feedback/`
- **API layer** in `src/lib/`:
  - `api.ts` — fetch wrapper with auth header injection + error handling
  - `api-client.ts` — typed API client functions
  - `api-types.ts` — API response types
  - `types.ts` — domain types
  - `query-client.ts` — TanStack Query config
  - `risk-score.ts` — host risk score calc
  - `scan-estimate.ts` — scan duration estimation
  - `utils.ts` — formatting + date helpers
- Main routes: Dashboard, Networks, Hosts, Alerts, Scans, Scanners, Port Rules, Trends, NSE (profiles/library/editor/results), Admin (users/roles/organization)
- Auth token in `localStorage` under `opm-auth-token`
- `VITE_API_BASE_URL` env var for API base URL (relative fallback)

### Code Style

- ESLint + Prettier (auto-configured)
- `react-refresh/only-export-components` rule (disabled for `context/` files)
- No unused locals or params (enforced by `tsconfig.json`)

## Scanner Conventions

- Uses `uv` with hatchling build system
- All Python projects need `[tool.hatch.build.targets.wheel]` in `pyproject.toml`
- Scanner types extensible via registry pattern (`scanners/registry.py`)
- Three implementations: **masscan** (port discovery), **nmap** (service detection + banners), **nse** (vulnerability scripts)
- Masscan needs `NET_RAW` + `NET_ADMIN` Docker capabilities
- Port spec exclusions prefixed `!` convert to `--exclude-ports`; defaults to full range if only exclusions
- Logs batched via `threading_utils.py`, sent to `/api/scanner/logs` every ~5s
- IPv6 scans check connectivity to public DNS IPv6 addresses, fail fast if unreachable
- SSH probing: auth methods, weak ciphers/KEX, version info
- Hostname enrichment via DNS reverse lookups (`hostname_enrichment.py`)
- NSE script caching with content hash + ETag (`script_cache.py`)
- Host discovery polls `/api/scanner/host-discovery-jobs` separately from scan jobs

## Release Process

1. Run `./release.sh [major|minor|patch]` — bumps `VERSION`, updates `CHANGELOG.md`, syncs NSE scripts, commits, tags, pushes
2. Tag push triggers GitHub Actions (`release.yml`): runs frontend typecheck, builds multi-arch Docker images, pushes to Docker Hub + GHCR, creates GitHub Release with changelog
3. Docker images: `styliteag/opm` (combined) and `styliteag/opm-scanner`
4. NSE scripts in `nse-templates/scripts/` synced from nmap GitHub repo during release; built-in profiles seeded on first backend startup

## Alert State Terminology

Alert state tracked across multiple orthogonal dimensions. Naming differs between layers:

### DB Columns (alerts table)

| Column | Type | Values |
|--------|------|--------|
| `dismissed` | Boolean | `true` / `false` |
| `dismiss_reason` | Text | free-text or `NULL` |
| `resolution_status` | Enum | `open`, `in_progress`, `resolved` |
| `assigned_to_user_id` | Integer FK | user ID or `NULL` |

"Accepted" **not** stored on alert — computed by matching against `port_rules` / `global_port_rules` (where `rule_type = 'accepted'`).

### Backend (Python enums)

- `ResolutionStatus`: `OPEN`, `IN_PROGRESS`, `RESOLVED`
- `RuleType`: `ACCEPTED`, `CRITICAL`
- `Severity` (computed per request): `CRITICAL`, `HIGH`, `MEDIUM`, `INFO` — forced to `INFO` when `dismissed=True`

### Frontend → Backend name mapping

| UI Label | Frontend filter value | DB / API field | API endpoint |
|----------|----------------------|----------------|--------------|
| **Pending Review** | `'pending'` | `dismissed=false` | — |
| **Dismissed** | `'dismissed'` | `dismissed=true` | `PUT /alerts/{id}/dismiss` |
| **Accepted** | `'accepted'` | rule match computed client-side | `POST /alerts/bulk-accept-global` or `bulk-accept-network` |
| **Blocked** | `'blocked'` | `severity='critical'` | — |
| **Reopen** | — | `dismissed=false` | `PUT /alerts/{id}/reopen` |
| **Revoke Rule** | — | deletes port rule row | `DELETE /api/port-rules/{scope}/{id}` |

### Key distinction

- **Dismiss** = sets `dismissed=true` (no rule, future scans still alert)
- **Accept** = sets `dismissed=true` AND creates `port_rules`/`global_port_rules` row with `rule_type='accepted'` (future scans won't alert)

## Important Gotchas

- Imports inside functions cause mypy strict mode issues — keep at top level
- When modifying models, also update related schemas + services
- Field names must match exactly between models, schemas, API responses
- `uv run mypy src/` may panic in sandboxed environments (system-configuration NULL object)
- Bulk ops: delete existing + create new in single transaction
- Validate nested resources belong to parent (e.g., `rule.network_id == network_id`)
- Alerts dedup by `(alert_type, ip, port)` while not dismissed
- `hatchling` needs `[tool.hatch.build.targets.wheel]` in `pyproject.toml`

## Browser Testing

For any story changing UI:
1. Load `dev-browser` skill
2. Navigate to relevant page
3. Verify UI changes work
4. Screenshot if helpful for progress log

Frontend story NOT complete until browser verification passes.

## Files to Read

For deeper context:
- `PLANNED-FEATURES.md` — upcoming features + user stories
- `CHANGELOG.md` — recent changes + release history
- `docs/README.md` — API reference + guides