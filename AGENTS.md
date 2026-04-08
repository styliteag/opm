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

- Registry pattern: **masscan** (port discovery), **nmap** (service detection), **nse** (vulnerability scripts)
- Masscan needs `NET_RAW` + `NET_ADMIN` Docker capabilities
- Port spec exclusions prefixed `!` → `--exclude-ports`; full range if only exclusions
- Logs batched via `threading_utils.py`, sent to `/api/scanner/logs` every ~5s
- IPv6: checks connectivity first, fails fast if unreachable
- Host discovery polls `/api/scanner/host-discovery-jobs` separately from scan jobs

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
3. Images: `styliteag/opm` (combined) and `styliteag/opm-scanner`

## Gotchas

- Imports inside functions cause mypy strict mode issues — keep at top level
- When modifying models, also update related schemas + services
- Field names must match exactly between models, schemas, API responses
- Bulk ops: delete existing + create new in single transaction
- Validate nested resources belong to parent (`rule.network_id == network_id`)
- `hatchling` needs `[tool.hatch.build.targets.wheel]` in `pyproject.toml`

## Browser Testing

For any UI change: navigate to page, verify, screenshot if helpful. Frontend story NOT complete until browser verification passes.
