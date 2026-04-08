# CLAUDE.md

STYLiTE Orbit Monitor — distributed network port scanning + monitoring (FastAPI, React 19, MariaDB 11, Docker).

Full conventions, architecture, patterns: @AGENTS.md

## Commands

```bash
# Dev environment
docker compose -f compose-dev.yml up --build

# Backend (from backend/)
cd backend && uv run --extra dev mypy src/
cd backend && uv run ruff check src/
cd backend && uv run --extra dev pytest

# Frontend (from frontend/)
cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run build
cd frontend && npm run test

# Alembic migration
docker exec opm-backend uv run alembic revision --autogenerate -m "desc"
```

**Do NOT use `npx tsc`** — fails. Use `npm run typecheck` or `npm run build`.

## Commit Format

`<type>: <description>` — types: feat, fix, refactor, docs, test, chore, perf, ci

**Every commit MUST update `CHANGELOG.md`** under `## [Unreleased]` (Keep a Changelog categories).

## Gotchas

- Frontend routing: TanStack Router in `src/routes/`, NOT `src/pages/`
- Feature modules in `src/features/` (admin, alerts, auth, dashboard, hosts, networks, nse, scanners, scans)
- Use `TYPE_CHECKING` for circular imports in SQLAlchemy relationship type hints
- Alembic migrations auto-apply on startup
- Scanner uses `uv` with hatchling build system
- Subdirectory CLAUDE.md files in `backend/`, `frontend/`, `scanner/` load automatically

## Rules

- [Design System](/.claude/rules/design-system.md) — Linear-inspired tokens (fonts, colors, surfaces)
- [Workflow](/.claude/rules/workflow.md) — Plan mode, verification, self-improvement loop

## Verification

After making changes, run all applicable checks:
```bash
cd backend && uv run --extra dev mypy src/ && uv run ruff check src/ && uv run --extra dev pytest
cd frontend && npm run typecheck && npm run lint && npm run test
```
