# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For full conventions, architecture, and patterns: @AGENTS.md

## Quick Reference

**Tech stack**: Python 3.12 (FastAPI) backend, React 19 + TypeScript (Vite, TanStack Router/Query) frontend, Python 3.12 scanner agent, MariaDB 11. All services run in Docker.

**Dev environment**: `docker compose -f compose-dev.yml up --build` — source is bind-mounted for hot reload. Do not restart containers unless necessary.

## Quality Checks (run locally)

```bash
# Backend (from backend/)
cd backend
uv run --extra dev mypy src/
uv run ruff check src/
uv run --extra dev pytest

# Frontend (from frontend/ — requires npm install first)
cd frontend
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # tsc -b && vite build
npm run test         # vitest run
```

**Do NOT use `npx tsc`** — it fails. Always use `npm run typecheck` or `npm run build`.

## Changelog

**Every commit MUST update `CHANGELOG.md`** under `## [Unreleased]` using Keep a Changelog categories (Added, Fixed, Changed, Removed, Security).

## Commit Format

`<type>: <description>` — types: feat, fix, refactor, docs, test, chore, perf, ci

## Key Gotchas

- Frontend uses TanStack Router file-based routing in `src/routes/`, NOT `src/pages/`
- Frontend feature modules live in `src/features/` (admin, alerts, auth, dashboard, hosts, networks, nse, scanners, scans)
- Backend architecture: Routes → Services → Models (Pydantic schemas for validation)
- Use `TYPE_CHECKING` for circular imports in SQLAlchemy relationship type hints
- Alembic migrations auto-apply on startup; use `docker exec opm-backend uv run alembic revision --autogenerate -m "desc"` to create new ones
- Scanner uses `uv` package manager with hatchling build system

## Subdirectory Instructions

Module-specific CLAUDE.md files can be added in `backend/`, `frontend/`, or `scanner/` for component-specific guidance. They load automatically when working in those directories.
