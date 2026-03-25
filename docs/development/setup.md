# Developer Setup Guide

This guide reflects the current Docker-first workflow used by the repository.

The repository can be inspected locally with Python, Bun, or Node installed on the host, but the normal application runtime for development is Docker Compose.

## Prerequisites

Required:

- Docker
- Docker Compose v2
- Git

Optional local tooling for inspection or non-container tasks:

- Python 3.12
- `uv`
- Node.js
- Bun

Important: normal backend and frontend development is expected to run through Docker Compose, not through direct host processes.

## Quick Start

### 1. Clone And Configure

```bash
git clone <repository-url>
cd opm
cp .env.example .env
```

### 2. Review Key Development Variables

Common `.env` values in the current development stack:

```bash
DB_ROOT_PASSWORD=rootpassword
DB_NAME=opm
DB_USER=opm
DB_PASSWORD=opmpassword

JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRATION_MINUTES=60
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin

TZ=Europe/Berlin
SCHEDULE_TIMEZONE=

SCANNER_BACKEND_URL=http://backend:8000
SCANNER_API_KEY=
SCANNER_POLL_INTERVAL=60
SCANNER_LOG_LEVEL=INFO

VITE_API_BASE_URL=http://localhost:8000
```

Notes:

- `SCANNER_API_KEY` can stay empty on first boot
- create a scanner later from the **Scanners** page and then restart the scanner container
- `SCHEDULE_TIMEZONE` is optional; if unset, cron schedules use the server local timezone

That last point matters if you test scheduled scans across time zones. The app is no longer assuming UTC-only cron interpretation.

### 3. Start The Stack

```bash
docker compose -f compose-dev.yml up --build
```

Detached mode is fine too:

```bash
docker compose -f compose-dev.yml up --build -d
```

## Development Services

The current development stack contains four containers:

| Service | Container | Port | Notes |
|---------|-----------|------|-------|
| database | `opm-db` | `3306` | MariaDB 11 |
| backend | `opm-backend` | `8000` | FastAPI with reload |
| frontend | `opm-frontend` | `5173` | Vite dev server |
| scanner | `opm-scanner` | none | background polling agent |

The scanner container is part of the normal development stack because end-to-end scan flows, scanner authentication, and host discovery all depend on it.

## First Login

Use:

- email: `admin@example.com`
- password: `admin`

## Hot Reload Behavior

### Backend

`./backend/src` is bind-mounted to `/app/src`, and the dev image runs the backend with reload enabled.

### Frontend

`./frontend/src` is bind-mounted to `/app/src`, and Vite HMR updates the browser automatically.

### Scanner

`./scanner/src` is bind-mounted to `/app/src`, but the scanner process does not auto-restart when code changes.

After scanner code changes:

```bash
docker compose -f compose-dev.yml restart scanner
```

If a change spans backend and scanner behavior, it is usually worth restarting only the scanner container after the backend hot reload settles. That avoids misreading stale scanner behavior as an API bug.

## Database Initialization And Migrations

The current startup flow is migration-first:

- backend startup scripts handle database readiness, Alembic migrations, and admin initialization before workers start
- the FastAPI lifespan still calls `init_db()` to ensure tables exist

Do not rely on `metadata.create_all()` as the primary schema update mechanism for existing databases. Schema changes should go through Alembic migrations.

In practice:

- use migrations for schema evolution
- treat `init_db()` as a safety net for bootstrapping, not as your migration strategy

### Run Migration Commands

```bash
docker exec opm-backend uv run alembic current
docker exec opm-backend uv run alembic upgrade head
docker exec opm-backend uv run alembic history
```

### Create A New Migration

```bash
docker exec opm-backend uv run alembic revision --autogenerate -m "describe change"
```

Migration files live in:

- `backend/src/migrations/versions/`

## Quality Checks

Run checks in the containers the project already uses.

### Backend

```bash
docker exec opm-backend uv run mypy src/
docker exec opm-backend uv run ruff check src/
docker exec opm-backend uv run pytest
```

These are the checks that matter before shipping backend changes because the codebase uses strict typing and async DB-heavy logic.

### Frontend

```bash
docker exec opm-frontend bun run typecheck
docker exec opm-frontend bun run lint
docker exec opm-frontend bun run test
```

Use `bun run typecheck` or `npm run typecheck`; do not substitute `npx tsc`.

### Scanner

```bash
docker exec opm-scanner uv sync --all-extras
docker exec opm-scanner uv run mypy src/
```

Scanner checks are easier to forget because the scanner is not a user-facing web service, but scan orchestration and subprocess handling are brittle enough that type regressions matter here too.

## Working With Scanners In Dev

### Create A Development Scanner

1. Open `http://localhost:5173`
2. Log in as admin
3. Open **Scanners**
4. Create a scanner
5. Copy the API key

That key is only shown once. If lost, regenerate it from the scanner management flow and update `.env`.

### Connect The Dev Scanner Container

Put the key in `.env`:

```bash
SCANNER_API_KEY=your-generated-api-key
```

Then restart the scanner:

```bash
docker compose -f compose-dev.yml restart scanner
```

## Useful Commands

### Logs

```bash
docker compose -f compose-dev.yml logs -f
docker compose -f compose-dev.yml logs -f backend
docker compose -f compose-dev.yml logs -f frontend
docker compose -f compose-dev.yml logs -f scanner
```

### Shell Access

```bash
docker exec -it opm-backend bash
docker exec -it opm-frontend sh
docker exec -it opm-scanner bash
docker exec -it opm-db mariadb -u opm -popmpassword opm
```

### Restart A Single Service

```bash
docker compose -f compose-dev.yml restart backend
docker compose -f compose-dev.yml restart frontend
docker compose -f compose-dev.yml restart scanner
```

## Common Problems

### Scanner starts but never scans

Check:

- `SCANNER_API_KEY` is set
- the scanner exists on the **Scanners** page
- `SCANNER_BACKEND_URL` still resolves to `http://backend:8000` in dev

Also check the scanner logs for backend readiness failures before assuming the job queue is broken.

### Hot reload does not reflect changes

- backend: inspect backend logs for reload events
- frontend: refresh the browser if HMR got stuck
- scanner: restart the scanner container manually

### Port conflict on host

Check:

```bash
lsof -i :5173
lsof -i :8000
lsof -i :3306
```

### Database state drift

If you intentionally want to wipe the local dev database:

```bash
docker compose -f compose-dev.yml down -v
docker compose -f compose-dev.yml up --build
```

This is destructive to local dev data.

## Related Docs

- [Development architecture](architecture.md)
- [Contributing](contributing.md)
- [Scanner deployment](../scanner/deployment.md)
