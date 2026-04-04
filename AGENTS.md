# AGENTS.md - STYLiTE Orbit Monitor

Guidelines for AI assistants working on this codebase. Read this file in full before making any changes.

## Project Overview

STYLiTE Orbit Monitor is a distributed network port scanning and monitoring system. It consists of three components running in Docker containers:

- **Backend** (`backend/`) — FastAPI REST API (Python 3.12, async)
- **Frontend** (`frontend/`) — React + Vite web dashboard (TypeScript)
- **Scanner** (`scanner/`) — Masscan/Nmap/NSE-based network scanner agent (Python 3.12)

Current version: see `VERSION` file (semver). Database: MariaDB 11.

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
│   │   │       ├── port-rules.tsx           # Unified port rules
│   │   │       ├── trends.tsx               # Trend charts
│   │   │       ├── nse/                     # NSE profiles, library, editor, results
│   │   │       └── admin/                   # Users, roles, organization (admin-only)
│   │   ├── features/          # Feature modules (domain-organized)
│   │   │   ├── admin/         # User, role, organization management
│   │   │   ├── alerts/        # Alert lifecycle, filtering, comments, assignment
│   │   │   ├── auth/          # Login, current user, JWT storage
│   │   │   ├── dashboard/     # Stats, scanner status, threat pulse, upcoming scans
│   │   │   ├── hosts/         # Host table, global ports, enriched port table, SSH inline
│   │   │   ├── networks/      # Network CRUD, port rules editor, NSE profile selection
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

All development runs through Docker Compose. **Never run frontend or backend directly outside Docker.**

```bash
docker compose -f compose-dev.yml up --build
```

The user has mostly already done this — **do not restart services** unless you have a specific reason. Source code changes are hot-reloaded via bind mounts.

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

You typically do **not** need to rebuild or restart containers after code changes.

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

**All commits must pass typecheck, lint, and tests. Do not commit broken code.**

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
**Do NOT make a code change without updating CHANGELOG.md.**

## Backend Conventions

### Architecture Pattern

Routes → Services → Models (with Pydantic schemas for validation)

- **Routers** (`routers/`): 21 thin HTTP handlers, delegate to services, call `db.commit()` after service ops
  - `auth`, `alerts`, `global_ports`, `global_settings`, `host_timeline`, `hosts`, `metadata`, `networks`, `nse`, `organization`, `policy`, `ports`, `roles`, `scanner`, `scanners`, `scans`, `ssh`, `trends`, `users`, `version`
  - Plus `/health` endpoint on the app directly
- **Services** (`services/`): 31 business logic modules, no HTTP concerns
- **Models** (`models/`): 22 SQLAlchemy 2.0 models with `Mapped[]` + `mapped_column()`
- **Schemas** (`schemas/`): 19 Pydantic v2 modules with `model_validate()` and `from_attributes=True`

### Database & ORM

- Use `TYPE_CHECKING` for circular import prevention in relationship type hints
- `mapped_column()` with `ForeignKey` requires `index=True` explicitly for indexed FK columns
- Use `str | None` union syntax for nullable fields in `Mapped[]` annotations
- Enum types should inherit from both `str` and `Enum` for proper serialization
- Use `selectinload()` for relationships to avoid async lazy-load errors

### Database Schema Initialization

- Database schema is initialized automatically on startup in `main.py` lifespan handler before the admin user is created.
- **Migration-first approach**: If Alembic migration files exist in `backend/src/migrations/versions/`, they are applied automatically on startup.
- **Fallback to models**: If no migrations exist, the schema is created from SQLAlchemy models using `Base.metadata.create_all()`.
- **Creating migrations**: When schema changes are needed:
  1. Create a migration: `docker exec opm-backend uv run alembic revision --autogenerate -m "description"`
  2. Review the generated migration file in `backend/src/migrations/versions/`
  3. The migration will be applied automatically on next startup
- Note: `create_all()` only creates missing tables; it does not modify existing tables. Always use migrations for schema changes.
- Files are numbered sequentially (001_, 002_, etc.).

### Type Checking

- For generic types in strict mypy mode, always specify type parameters (e.g., `dict[str, Any]` not `dict`)
- Use `from jose.exceptions import JWTError` not `jwt.JWTError` for proper type stub compatibility
- Add `types-python-jose` and `types-passlib` to dev dependencies for mypy support
- Use `collections.abc.AsyncGenerator` for async generator type hints (not `typing.AsyncGenerator`)

### Authentication & Authorization

- JWT-based auth with `HS256` algorithm
- User tokens: `sub` = user ID, `email`, `role` in payload
- Scanner tokens: `sub` = scanner ID, `scope` = "scanner" (short-lived, 15 min)
- API keys: `X-API-Key` header, bcrypt-hashed, returned only at creation time
- Rate limiting: in-memory sliding window with `threading.Lock`
- Use `CurrentUser`, `AdminUser`, `CurrentScanner`, `DbSession` type aliases from `core/deps.py`
- `AdminUser` returns 403 Forbidden automatically for non-admin users
- `CurrentScanner` validates scanner JWT scope

### Security

- Use `secrets.token_hex(32)` for generating 64-character API keys (32 bytes = 64 hex chars)
- Reuse `hash_password/verify_password` from security module for API key hashing (bcrypt)
- Return API key only once at creation time; store only the hash

### API Patterns

- Pattern for list responses: create a wrapper schema (e.g., `UserListResponse`) with a typed list field
- Nested resources (e.g., rules under networks) can share the same router file for related endpoints
- Use `db.commit()` in router after service operations to ensure transaction completes
- For nullable optional fields in updates, use explicit flags (e.g., `clear_schedule=True`) to distinguish "not updating" vs "clearing"
- `HTTPBearer` security scheme provides credentials via `HTTPAuthorizationCredentials`
- CORS config uses `list[str]` for origins, parsed from comma-separated env var
- FastAPI middleware must be added using `app.add_middleware()`
- Pydantic-settings `SettingsConfigDict` handles `.env` file loading automatically
- FastAPI lifespan contextmanager is preferred over deprecated `@app.on_event("startup")`

### Validation

- Use Python's `ipaddress` module to validate CIDR notation (`ipaddress.ip_network` with `strict=False`)
- Port spec validation: parse comma-separated segments, handle ranges (80-443), handle exclusions (!88)
- Cron schedule validation: check for 5-6 fields and basic pattern matching
- Use Pydantic's `field_validator` decorator for custom validation logic
- Use Pydantic `field_validator` for validating enum-like string fields before DB conversion

### Service Layer Patterns

- Always check for duplicate email when creating/updating users to return meaningful error messages
- For tracking `first_seen_at` across scans, query previous scans of the same network for existing ip:port records
- Excluded ports support network-wide entries with `ip=None`; scanner filtering checks both ip-specific tuples and port-only exclusions
- Scanner results accept RUNNING or CANCELLED scans; cancelled submissions store partial results without changing status
- For job claiming, check running status before checking planned scans to return correct 409 vs 404
- Scheduled scans are created by an APScheduler job every minute; skip networks with planned/running scans
- Bulk operations should delete existing records and create new ones in a single transaction
- Always validate that nested resources belong to the parent (e.g., `rule.network_id == network_id`)
- Port rules can include optional `ip`; alert evaluation merges global ranges with IP-specific ranges
- Alerts should include `network_id` and be deduped by `(alert_type, ip, port)` while not dismissed
- Alert email recipients resolve from network `alert_config.email_recipients` (or `recipients`) or `ALERT_EMAIL_RECIPIENTS`; UI links use `WEB_UI_URL`

## Frontend Conventions

### Tech Stack

- React 18, Vite, TypeScript (strict mode)
- TanStack Router (file-based routing), TanStack Query (React Query) for server state
- React Hook Form + Zod for form validation
- Tailwind CSS for styling
- Context API for auth (`AuthContext`) and theme (`ThemeContext`)

### Architecture

- **File-based routing** in `src/routes/` via TanStack Router (NOT `src/pages/`)
  - `__root.tsx` — HTML shell
  - `_authenticated.tsx` — auth guard layout (replaces `ProtectedRoute` wrapper)
  - `_authenticated/` — all protected routes nested under auth guard
- **Feature modules** in `src/features/` — domain-organized (admin, alerts, auth, dashboard, hosts, networks, nse, scanners, scans)
  - Each feature contains: `components/`, `hooks/`, and optionally `schemas/`
- **Shared components** in `src/components/` — organized by category: `ui/`, `layout/`, `data-display/`, `feedback/`
- **API layer** in `src/lib/`:
  - `api.ts` — fetch wrapper with auth header injection and error handling
  - `api-client.ts` — typed API client functions
  - `api-types.ts` — API response type definitions
  - `types.ts` — domain type definitions
  - `query-client.ts` — TanStack Query client config
  - `risk-score.ts` — host risk score calculation
  - `scan-estimate.ts` — scan duration estimation
  - `utils.ts` — formatting and date helpers
- Main routes: Dashboard, Networks, Hosts, Alerts, Scans, Scanners, Port Rules, Trends, NSE (profiles/library/editor/results), Admin (users/roles/organization)
- Auth token stored in `localStorage` under `opm-auth-token`
- `VITE_API_BASE_URL` env var for API base URL (relative fallback)

### Code Style

- ESLint + Prettier for formatting (auto-configured)
- `react-refresh/only-export-components` rule (disabled for `context/` files)
- No unused locals or parameters (enforced by `tsconfig.json`)

## Scanner Conventions

- Uses `uv` package manager with hatchling build system
- All Python projects need `[tool.hatch.build.targets.wheel]` config in `pyproject.toml`
- Scanner types are extensible via a registry pattern (`scanners/registry.py`)
- Three scanner implementations: **masscan** (port discovery), **nmap** (service detection + banners), **nse** (vulnerability scripts)
- Masscan requires `NET_RAW` and `NET_ADMIN` Docker capabilities
- Port spec exclusions prefixed with `!` convert to `--exclude-ports`; defaults to full range if only exclusions are provided
- Logs batched locally via `threading_utils.py`, sent to `/api/scanner/logs` every ~5 seconds
- IPv6 scans check connectivity to public DNS IPv6 addresses, fail fast if unreachable
- SSH probing detects auth methods, weak ciphers/KEX, version info
- Hostname enrichment via DNS reverse lookups (`hostname_enrichment.py`)
- NSE script caching with content hash and ETag support (`script_cache.py`)
- Host discovery polls `/api/scanner/host-discovery-jobs` separately from scan jobs

## Release Process

1. Run `./release.sh [major|minor|patch]` — bumps `VERSION`, updates `CHANGELOG.md`, syncs NSE scripts from upstream nmap, commits, tags, pushes
2. Tag push triggers GitHub Actions (`release.yml`): runs frontend typecheck, builds multi-arch Docker images, pushes to Docker Hub and GHCR, creates GitHub Release with changelog notes
3. Docker images: `styliteag/opm` (combined app) and `styliteag/opm-scanner`
4. NSE scripts in `nse-templates/scripts/` are synced from the nmap GitHub repo during release; built-in profiles are seeded on first backend startup

## Alert State Terminology

Alert state is tracked across multiple orthogonal dimensions. The naming differs between layers:

### DB Columns (alerts table)

| Column | Type | Values |
|--------|------|--------|
| `dismissed` | Boolean | `true` / `false` |
| `dismiss_reason` | Text | free-text or `NULL` |
| `resolution_status` | Enum | `open`, `in_progress`, `resolved` |
| `assigned_to_user_id` | Integer FK | user ID or `NULL` |

"Accepted" is **not** stored on the alert — it is computed by matching against `port_rules` / `global_port_rules` (where `rule_type = 'accepted'`).

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

- **Dismiss** = sets `dismissed=true` (no rule created, future scans still alert)
- **Accept** = sets `dismissed=true` AND creates a `port_rules`/`global_port_rules` row with `rule_type='accepted'` (future scans won't alert)

## Important Gotchas

- Imports inside functions cause mypy strict mode issues — keep at top level
- When modifying models, also update related schemas and services to keep in sync
- Field names must match exactly between models, schemas, and API responses
- `uv run mypy src/` may panic in sandboxed environments (system-configuration NULL object)
- For bulk operations, delete existing records and create new ones in a single transaction
- Always validate nested resources belong to the parent (e.g., `rule.network_id == network_id`)
- Alerts deduplicate by `(alert_type, ip, port)` while not dismissed
- `hatchling` requires `[tool.hatch.build.targets.wheel]` in `pyproject.toml`

## Browser Testing

For any story that changes UI:
1. Load the `dev-browser` skill
2. Navigate to the relevant page
3. Verify the UI changes work as expected
4. Take a screenshot if helpful for the progress log

A frontend story is NOT complete until browser verification passes.

## Files to Read

For deeper context on project conventions, also see:
- `PLANNED-FEATURES.md` — upcoming feature plans and user stories
- `CHANGELOG.md` — recent changes and release history
- `docs/README.md` — API reference and guides
