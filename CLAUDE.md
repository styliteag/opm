# CLAUDE.md - Open Port Monitor

Guidelines for AI assistants working on this codebase. Read this file in full before making any changes.

## Project Overview

Open Port Monitor is a distributed network port scanning and monitoring system. It consists of three components running in Docker containers:

- **Backend** (`backend/`) — FastAPI REST API (Python 3.12, async)
- **Frontend** (`frontend/`) — React + Vite web dashboard (TypeScript)
- **Scanner** (`scanner/`) — Masscan/Nmap-based network scanner agent (Python 3.12)

Current version: see `VERSION` file (semver). Database: MariaDB 11.

## Repository Structure

```
open-port-monitor/
├── backend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/          # Config, database, security, dependencies
│   │   │   ├── models/        # SQLAlchemy ORM models
│   │   │   ├── routers/       # FastAPI route handlers
│   │   │   ├── schemas/       # Pydantic request/response schemas
│   │   │   ├── services/      # Business logic layer
│   │   │   └── main.py        # App entry point, lifespan, router registration
│   │   └── migrations/versions/  # Alembic migration files
│   ├── tests/                 # pytest async tests (SQLite in-memory)
│   ├── pyproject.toml         # Dependencies, mypy/ruff/pytest config
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── context/           # AuthContext, ThemeContext
│   │   ├── pages/             # Route pages (Dashboard, Networks, Scans, etc.)
│   │   ├── lib/               # API client (fetch wrapper)
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Utility functions
│   │   └── constants/         # Static constants
│   ├── package.json           # Dependencies, scripts
│   ├── tsconfig.json          # Strict TypeScript config
│   ├── eslint.config.js       # ESLint + Prettier config
│   └── vite.config.ts         # Vite + Vitest config
├── scanner/
│   ├── src/
│   │   ├── scanners/          # Scanner implementations (masscan, nmap, base, registry)
│   │   ├── main.py            # Scanner entry point
│   │   ├── client.py          # Backend API client
│   │   ├── models.py          # Pydantic models
│   │   ├── orchestration.py   # Scan job orchestration
│   │   ├── ssh_probe.py       # SSH security probing
│   │   └── discovery.py       # Host discovery
│   └── tests/
├── docker/                    # Nginx config, startup scripts for production
├── docs/                      # API reference, scanner docs, development guides
├── .github/workflows/         # CI: release.yml (tag-triggered Docker builds)
├── compose-dev.yml            # Development Docker Compose
├── compose.yml                # Production Docker Compose
├── Dockerfile                 # Multi-stage production build (frontend + backend + nginx)
├── CHANGELOG.md               # Keep a Changelog format — MUST be updated with every commit
├── AGENTS.md                  # Extended conventions (see also)
└── VERSION                    # Semver version file
```

## Development Environment

### Starting Services

All development runs through Docker Compose. **Never run frontend or backend directly outside Docker.**

```bash
docker compose -f compose-dev.yml up --build
```

If containers are already running, **do not restart them** unless you have a specific reason — source code changes are hot-reloaded via bind mounts.

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
# Type checking (strict mypy with Pydantic plugin)
docker exec opm-backend uv run mypy src/

# Linting (ruff — E, F, I, W rules, 100 char line length)
docker exec opm-backend uv run ruff check src/

# Tests (pytest-asyncio, SQLite in-memory)
docker exec opm-backend uv run pytest
```

### Frontend (TypeScript)

```bash
# Type checking (strict TypeScript)
docker exec opm-frontend bun run typecheck

# Linting (ESLint + Prettier)
docker exec opm-frontend bun run lint

# Tests (Vitest + React Testing Library + jsdom)
docker exec opm-frontend bun run test
```

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

## Backend Conventions

### Architecture Pattern

Routes → Services → Models (with Pydantic schemas for validation)

- **Routers** (`routers/`): Thin HTTP handlers, delegate to services, call `db.commit()` after service ops
- **Services** (`services/`): Business logic, database queries, no HTTP concerns
- **Models** (`models/`): SQLAlchemy 2.0 style with `Mapped[]` + `mapped_column()`
- **Schemas** (`schemas/`): Pydantic v2 with `model_validate()` and `from_attributes=True`

### Key Patterns

- **Dependencies**: Use `CurrentUser`, `AdminUser`, `CurrentScanner`, `DbSession` type aliases from `core/deps.py`
- **Enums**: Inherit from both `str` and `Enum` for proper serialization
- **Nullable fields**: Use `str | None` union syntax in `Mapped[]` annotations
- **Circular imports**: Use `TYPE_CHECKING` for relationship type hints
- **Eager loading**: Use `selectinload()` for relationships to avoid async lazy-load errors
- **Validation**: Use `ipaddress.ip_network(strict=False)` for CIDR, Pydantic `field_validator` for custom logic
- **Generic types**: Always specify type parameters in strict mypy mode (`dict[str, Any]` not `dict`)
- **Async generators**: Use `collections.abc.AsyncGenerator` (not `typing.AsyncGenerator`)

### Database Migrations

Migrations are applied automatically on startup. When making schema changes:

```bash
docker exec opm-backend uv run alembic revision --autogenerate -m "description"
```

Review the generated file in `backend/src/migrations/versions/`. Files are numbered sequentially (001_, 002_, etc.).

Note: `create_all()` does NOT modify existing tables — always use migrations for schema changes.

### Authentication

- JWT-based auth with `HS256` algorithm
- User tokens: `sub` = user ID, `email`, `role` in payload
- Scanner tokens: `sub` = scanner ID, `scope` = "scanner" (short-lived, 15 min)
- API keys: `X-API-Key` header, bcrypt-hashed, returned only at creation time
- Rate limiting: in-memory sliding window with `threading.Lock`

## Frontend Conventions

### Tech Stack

- React 18, Vite, TypeScript (strict mode)
- React Router v7, TanStack Query (React Query) for server state
- Tailwind CSS for styling
- Context API for auth (`AuthContext`) and theme (`ThemeContext`)

### Architecture

- Pages in `src/pages/` — each maps to a route
- Reusable components in `src/components/`
- API calls through `src/lib/api.ts` (fetch wrapper)
- All types centralized in `src/types/index.ts`
- Auth token stored in `localStorage` under `opm-auth-token`
- `VITE_API_BASE_URL` env var for API base URL (relative fallback)
- Protected routes use `ProtectedRoute` component wrapper

### Code Style

- ESLint + Prettier for formatting (auto-configured)
- `react-refresh/only-export-components` rule (disabled for `context/` files)
- No unused locals or parameters (enforced by `tsconfig.json`)

## Scanner Conventions

- Uses `uv` package manager with hatchling build system
- Scanner types are extensible via a registry pattern (`scanners/registry.py`)
- Masscan requires `NET_RAW` and `NET_ADMIN` Docker capabilities
- Port spec exclusions prefixed with `!` convert to `--exclude-ports`
- Logs batched locally, sent to `/api/scanner/logs` every ~5 seconds
- IPv6 scans check connectivity to public DNS IPv6 addresses, fail fast if unreachable
- SSH probing detects auth methods, weak ciphers/KEX, version info

## Release Process

1. Run `./release.sh [major|minor|patch]` — bumps `VERSION`, updates `CHANGELOG.md`, commits, tags, pushes
2. Tag push triggers GitHub Actions (`release.yml`): runs frontend typecheck, builds multi-arch Docker images, pushes to Docker Hub and GHCR, creates GitHub Release with changelog notes
3. Docker images: `styliteag/open-port-monitor` (combined app) and `styliteag/open-port-monitor-scanner`

## Important Gotchas

- Imports inside functions cause mypy strict mode issues — keep at top level
- When modifying models, also update related schemas and services to keep in sync
- Field names must match exactly between models, schemas, and API responses
- `uv run mypy src/` may panic in sandboxed environments (system-configuration NULL object)
- For bulk operations, delete existing records and create new ones in a single transaction
- Always validate nested resources belong to the parent (e.g., `rule.network_id == network_id`)
- Alerts deduplicate by `(alert_type, ip, port)` while unacknowledged
- `hatchling` requires `[tool.hatch.build.targets.wheel]` in `pyproject.toml`

## Files to Read

For deeper context on project conventions, also see:
- `AGENTS.md` — extended patterns and conventions
- `PLANNED-FEATURES.md` — upcoming feature plans and user stories
- `CHANGELOG.md` — recent changes and release history
- `docs/README.md` — API reference and guides
