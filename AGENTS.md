# AGENTS.md - Open Port Monitor

Project-wide patterns, conventions, and important information for developers and agents working on this codebase.

## Project Structure

This is a distributed network port scanning and monitoring system with three main components:

- **Backend**: FastAPI application (`backend/`) - REST API, database models, business logic
- **Frontend**: React + Vite application (`frontend/`) - Web dashboard
- **Scanner**: Python scanner agent (`scanner/`) - Masscan-based network scanner

All components use Docker for development with hot-reload via source bind mounts.

## Scanner Patterns

- Scanner converts port_spec exclusions (prefixed with `!`) into masscan `--exclude-ports` and defaults to full range if only exclusions are provided
- Scanner batches logs locally and sends them to `/api/scanner/logs` about every 5 seconds during scans
- IPv6 scans perform a connectivity check to public DNS IPv6 addresses and fail fast if unreachable

## Development Setup

### Docker Development
- Use `docker compose -f compose-dev.yml up --build` to start all services
- mostly the user already done this, so please dont restart the services unless you know what you are doing.
- Source bind mounts: `backend/src`, `frontend/src`, `scanner/src` → `/app/src` for hot-reload
- **Auto-reload enabled**: Python and npm watch for code changes - you typically don't need to rebuild or restart containers
- Use `docker exec -it <container-name> bash` to inspect/debug running containers
- **Container names**: `opm-backend`, `opm-frontend`, `opm-scanner`, `opm-db`
- **Services**: Frontend (5173), Backend (8000), Database (3306)
- **Access URLs**: Frontend at http://localhost:5173/ and Backend at http://localhost:8000/
- **Default credentials**:
  - Admin user: `admin@example.com` / `admin` (from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars)
  - Database: `opm` / `opmpassword` (from `DB_USER`/`DB_PASSWORD` env vars)
  - Check `.env` file or `compose-dev.yml` for overrides
- Never run a frontend or backend directly, always use docker compose to start the services!

### Package Management & Quality Checks
- **Backend**: Uses `uv` package manager
  - Typecheck: `docker exec opm-backend uv run mypy src/`
  - Lint: `docker exec opm-backend uv run ruff check src/`
  - Tests: `docker exec opm-backend uv run pytest` (if tests exist)
- **Frontend**: Uses Bun
  - Typecheck: `docker exec opm-frontend bun run typecheck`
  - Lint: `docker exec opm-frontend bun run lint`
  - No tests currently configured
- **Scanner**: Uses `uv`
  - Typecheck: `docker exec opm-scanner uv sync --all-extras && uv run mypy src/`

### Python Build Configuration
- All Python projects need `[tool.hatch.build.targets.wheel]` config in `pyproject.toml` for hatchling to work

## Backend Patterns

## Never run a frontend or backend directly, always use docker compose to start the services!
- Use `docker compose -f compose-dev.yml up --build` to start all services

### Database & ORM
- SQLAlchemy models use `Mapped[]` type annotations with `mapped_column()` for strict typing
- Use `TYPE_CHECKING` for circular import prevention in relationship type hints
- `mapped_column()` with `ForeignKey` requires `index=True` explicitly for indexed FK columns
- Use `str | None` union syntax for nullable fields in `Mapped[]` annotations
- Enum types in SQLAlchemy should inherit from both `str` and `Enum` for proper serialization
- When exposing relationship-derived fields in schemas, eager-load the relationship (e.g., `selectinload`) to avoid async lazy-load errors

### Database Schema Initialization
- Database schema is initialized automatically on startup in `main.py` lifespan handler before the admin user is created.
- **Migration-first approach**: If Alembic migration files exist in `backend/src/migrations/versions/`, they are applied automatically on startup.
- **Fallback to models**: If no migrations exist, the schema is created from SQLAlchemy models using `Base.metadata.create_all()`.
- **Creating migrations**: When schema changes are needed:
  1. Create a migration: `docker exec opm-backend uv run alembic revision --autogenerate -m "description"`
  2. Review the generated migration file in `backend/src/migrations/versions/`
  3. The migration will be applied automatically on next startup
- Note: `create_all()` only creates missing tables; it does not modify existing tables (add columns, change types, etc.). Use migrations for schema changes to existing tables.

### Type Checking
- For generic types in strict mypy mode, always specify type parameters (e.g., `dict[str, Any]` not `dict`)
- Use `from jose.exceptions import JWTError` not `jwt.JWTError` for proper type stub compatibility
- Add `types-python-jose` and `types-passlib` to dev dependencies for mypy support
- Use `collections.abc.AsyncGenerator` for async generator type hints (not `typing.AsyncGenerator`)

### Authentication & Authorization
- Use `AdminUser` dependency type alias for admin-only routes (returns 403 Forbidden automatically)
- Use `CurrentScanner` dependency type alias for scanner-only routes (validates scanner JWT scope)
- Use `CurrentUser` dependency for read-only endpoints accessible by any authenticated user
- Scanner JWT tokens should have short expiration (15 min) and "scanner" scope in payload

### API Patterns
- Use Pydantic's `model_validate()` with `from_attributes=True` config for ORM model conversion
- Pattern for list responses: create a wrapper schema (e.g., `UserListResponse`) with a typed list field
- Nested resources (e.g., rules under networks) can share the same router file for related endpoints
- Use `db.commit()` in router after service operations to ensure transaction completes
- For nullable optional fields in updates, use explicit flags (e.g., `clear_schedule=True`) to distinguish between "not updating" vs "clearing"

### Security
- Use `secrets.token_hex(32)` for generating 64-character API keys (32 bytes = 64 hex chars)
- Reuse `hash_password/verify_password` from security module for API key hashing (bcrypt)
- Return API key only once at creation time; store only the hash
- Use `X-API-Key` header (FastAPI `Header` dependency) for scanner API key authentication
- In-memory rate limiting with sliding window: store timestamps per IP, clean up old entries
- Use `threading.Lock` for thread-safe in-memory rate limiting store

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
- Alerts should include `network_id` and be deduped by `(alert_type, ip, port)` while unacknowledged
- Alert email recipients resolve from network `alert_config.email_recipients` (or `recipients`) or `ALERT_EMAIL_RECIPIENTS`; UI links use `WEB_UI_URL`

### FastAPI Patterns
- FastAPI lifespan contextmanager is preferred over deprecated `@app.on_event("startup")`
- `HTTPBearer` security scheme provides the credentials via `HTTPAuthorizationCredentials`
- CORS config uses `list[str]` for origins, which is parsed from comma-separated env var
- FastAPI middleware must be added using `app.add_middleware()`
- Pydantic-settings `SettingsConfigDict` handles `.env` file loading automatically

## Frontend Patterns

### Tech Stack
- **React 18** with **Vite** for build tooling
- **React Router v7** for routing
- **TanStack Query (React Query)** for server state management
- **Tailwind CSS** for styling
- **TypeScript** for type safety
- **Context API** for auth and theme state

### Architecture
- Auth token is stored in localStorage under `opm-auth-token`; API base URL uses `VITE_API_BASE_URL` with relative fallback
- Authentication handled via `AuthContext` with JWT tokens
- Theme switching via `ThemeContext` (light/dark mode)
- Protected routes use `ProtectedRoute` component wrapper
- Main pages: Dashboard, Networks, Scans, Hosts, Risk Overview, Policy, Users (admin-only)

## Important Gotchas

- Import statements inside functions cause mypy strict mode issues - move to top level
- Scanner uses `uv sync --all-extras` to install dev dependencies including mypy
- `uv run mypy src/` may panic in sandboxed environments with system-configuration NULL object; no workaround found yet
- When modifying models, also update related schemas and services to keep them in sync
- Field names must match between models, schemas, and API responses exactly

## Testing & Quality

- ALL commits must pass project's quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Documentation Requirements

- **CHANGELOG.md**: Always update when making changes:
  - Add new features under `### Added`
  - Add bug fixes under `### Fixed`
  - Add breaking changes under `### Changed`
  - Add deprecations under `### Deprecated`
  - Add removals under `### Removed`
  - Add security fixes under `### Security`
  - Place entries under `## [Unreleased]` section
- Keep changelog entries concise but descriptive
- Reference issue numbers if applicable

## Browser Testing

For any story that changes UI:
1. Load the `dev-browser` skill
2. Navigate to the relevant page
3. Verify the UI changes work as expected
4. Take a screenshot if helpful for the progress log

A frontend story is NOT complete until browser verification passes.
