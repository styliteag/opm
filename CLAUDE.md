# CLAUDE.md — Operating Manual

STYLiTE Orbit Port Monitor (opm) — distributed network port scanning + monitoring.
FastAPI + SQLAlchemy 2.0 async + Alembic + MariaDB 11 · React 19 + TanStack Router/Query + Tailwind v4 · Python scanner agents (masscan/nmap/NSE/nuclei/GVM) · Docker Compose.

Domain encyclopedia (GVM library/mirror, nuclei, severity rules, alert-state terminology): @AGENTS.md
Rules: [Design System](/.claude/rules/design-system.md) · [Workflow](/.claude/rules/workflow.md)

## 0. Mental Model (read before touching anything)

- **Scanners discover and submit facts. Backend services decide what facts mean** (alerts, policy, scheduling). Frontend is an operator console. Never generate alerts scanner-side; never put business policy in the scanner.
- Dev stack = 4 containers (`opm-db`, `opm-backend` :8000, `opm-frontend` :5173, `opm-scanner`). Backend and frontend hot-reload via bind mounts. **The scanner does NOT hot-reload** — after editing `scanner/src`, run `docker compose -f compose-dev.yml restart scanner`.
- Migrations apply on backend startup (entrypoint). `create_all()` is only a fallback for fresh installs.
- **CI runs nothing on normal pushes.** The tag workflow runs only frontend typecheck + Docker builds. Local checks are the ONLY quality gate. Never think "CI will catch it."
- Credentials: `admin@example.com` / `admin`. DB from host: `docker exec -it opm-db mariadb -uopm -popmpassword opm`.

## 1. Commands

Use `just` (see `justfile`):

```bash
just dev-up / dev-down / dev-logs      # dev stack (compose-dev.yml)
just check                             # backend-check + frontend-check
just backend-check                     # ruff + mypy + pytest (runs locally via uv)
just frontend-check                    # lint + typecheck + test
just migrate "description"             # alembic autogenerate (inside opm-backend)
just gvm-up                            # optional Greenbone stack (compose-gvm.yml)
just release patch|minor|major         # bump VERSION, cut CHANGELOG, tag, push (interactive!)
```

Raw equivalents when just is unavailable:

```bash
cd backend && uv run --extra dev mypy src/ && uv run ruff check src/ && uv run --extra dev pytest
cd frontend && npm run typecheck && npm run lint && npm run test
cd scanner && uv run mypy src/ && uv run ruff check src/ && uv run --extra dev pytest
```

**Never `npx tsc`** — it fails. Use `npm run typecheck`.

## 2. How Work Ships Here

- **Vertical slices.** One feature = ONE commit spanning model + migration + schema + service + router + frontend + tests + CHANGELOG. Never split a feature into a backend commit and a frontend commit. (This overrides any general preference for split commits.)
- **CHANGELOG.md is mandatory in every feat/fix/refactor/perf/security commit.** Entry goes under `## [Unreleased]` in the right Keep-a-Changelog category, prefixed `**Backend**:` / `**Frontend**:` / `**Scanner**:` / `**Admin**:` / `**Dependencies**:`. House style is a full descriptive paragraph naming endpoints, columns, and migration numbers — not a one-liner. Read the existing `[Unreleased]` block first and match it.
- **Commits:** `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci, security). Imperative, no trailing period, no co-authored-by. Body explains *why*, scoping decisions, and how it was tested. Fix commits name the exact failure mechanism.
- **Planning lives in Markdown, not an issue tracker:** `USERSTORYS.md` (master stories) → `PLANNED-FEATURES.md` (`**Implementing:** yes`) → build → move story to `COMPLETED-FEATURES.md` with an `**Implemented:**` paragraph → tick the box in `TODO.md`. When you complete a planned feature, update these files in the same commit.
- **Release:** `just release patch` — requires a clean tree and a TTY (interactive y/N). It cuts `[Unreleased]` into a dated section, bumps `VERSION`, commits `chore: bump version to X`, tags `X.Y.Z` (no `v` prefix), pushes. The tag triggers multi-arch builds of 3 images to Docker Hub + GHCR. Never run it with uncommitted changes; never tag by hand.
- **Knowledge graph first:** use the `code-review-graph` MCP tools (`semantic_search_nodes`, `query_graph`, `get_impact_radius`, `detect_changes`) before Grep/Glob/Read for exploration and review. Hooks keep the graph fresh after every edit.

## 3. Backend Rules (`backend/src/app`)

Layout: `core/` (config, deps, security, permissions) · `models/` (one file per table) · `schemas/` (Pydantic v2) · `routers/` (HTTP only) · `services/` (business logic, largest layer) · `repositories/` (partial `BaseRepository[T]`) · `src/migrations/versions/`.

- **The router owns the transaction.** `await db.commit()` appears in the router after the service call — never in a service. Services `flush()` + `refresh()` and return `Model | None | list | dict`. Services never raise `HTTPException`; the router translates `None` → `raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, ...)` (use raw `HTTPException`, not `core/exceptions.py`).
- Services are **free `async def` functions** with signature `async def x(db: AsyncSession, ...)` — not classes (except thin `BaseRepository` subclasses that already exist).
- **Schemas:** `XCreateRequest` / `XUpdateRequest` / `XResponse` / `XListResponse` (list wrapper with a typed field, e.g. `networks: list[NetworkResponse]`). Responses use `model_config = {"from_attributes": True}` and are built with `Model.model_validate(orm_obj)`. Field names must match model ↔ schema ↔ service kwargs ↔ response exactly.
- **Nullable update fields need `clear_*` flags** — `None` cannot mean both "don't touch" and "set NULL". Wire all four places: schema field, service param, service `clear_x: bool` param, and router derivation `clear_x="x" in request.model_fields_set`.
- **DI aliases from `core/deps.py`:** `CurrentUser`, `AdminUser`, `OperatorUser`, `AnalystUser`, `CurrentScanner`, `DbSession`, `Pagination`. Fine-grained checks via `require_permission(Permission.X)` from `core/permissions.py`. Roles: admin > operator > analyst > viewer.
- **Enums** inherit `(str, Enum)` and every enum column sets `values_callable=lambda x: [e.value for e in x]` — otherwise enum NAMES land in the DB.
- **Datetimes are naive UTC in the DB** (`DateTime` without `timezone=True`, server default `func.utc_timestamp()`). Write `datetime.now(timezone.utc)`; when computing with values read back, re-attach with `.replace(tzinfo=timezone.utc)`.
- **New model → register it in `models/__init__.py`.** Otherwise Alembic autogenerate misses the table and string-based `relationship("X")` targets don't resolve.
- **Migrations:** create with `just migrate "desc"` (runs inside the container). Set `down_revision` to the actual head from `alembic heads` — the numbering is NOT linear (`16a`, `025_add_2fa_totp` exist). Add idempotency guards (`_column_exists()` / `_table_exists()` via information_schema) like migration 013 does, because dev DBs may have columns pre-created by `create_all`. Review the autogenerated file before accepting it.
- **Relationships:** type hints under `if TYPE_CHECKING:` with string targets. `selectinload()` is applied *per query where the relationship is accessed* — `BaseRepository.get_by_id` does NOT eager-load; touching a lazy relationship after the session ends raises MissingGreenlet.
- FK columns need explicit `index=True` in `mapped_column(ForeignKey(...), index=True)`.
- **JWT uses PyJWT**: `import jwt`, `from jwt.exceptions import PyJWTError`. (AGENTS.md still says python-jose — that is stale; python-jose is not installed.)
- mypy strict + pydantic plugin: type params always (`dict[str, Any]`), all signatures annotated, imports at top level (function-level imports only for optional deps). ruff: E/F/I/W, line length 100.
- **Tests** (`backend/tests/`, flat, ~440 tests): SQLite in-memory (aiosqlite), `asyncio_mode="auto"` (no decorator needed). Use existing fixtures: `db_session`, `client`, `admin_headers`/`viewer_headers`/`scanner_headers`, factories (`UserFactory`, `NetworkFactory`, `ScannerFactory`). Service tests call service functions with `db_session`; router tests go through `client`. New MariaDB-only server defaults will break the suite unless the conftest UDF hack covers them (`utc_timestamp` is already registered).
- New scanner types register in `core/scanner_types.py` via `register_scanner_type(...)` — never hardcode type lists in schemas.

## 4. Frontend Rules (`frontend/src`)

- **Canonical API layer: `src/lib/api.ts`** (`fetchApi`/`postApi`/`putApi`/`patchApi`/`deleteApi`) **+ hand-written types in `src/lib/types.ts`** mirroring the Pydantic schemas 1:1. `src/lib/api-client.ts` (openapi-fetch) and `api-types.ts` are dormant scaffolding with zero real importers — never use or extend them (only `extractErrorMessage` is live). Raw `fetch()` only for non-JSON payloads (FormData/Blob/XML), following `features/gvm-library/api.ts`.
- **Routing:** TanStack Router file-based in `src/routes/` (there is no `src/pages/`). `routeTree.gen.ts` is generated — never edit it. Filename grammar: `_authenticated` = pathless layout/auth gate, `$param` = dynamic segment, `users_.$userId.tsx` = trailing underscore un-nests from the `users` layout (needed when the parent has no `<Outlet/>`), `index.tsx` = index route. Routes stay thin: hook + `LoadingState`/`ErrorState` + feature components.
- **Features** in `src/features/<name>/` with `components/`, `hooks/`, optional `schemas/`. Data hooks always in `features/<x>/hooks/useX.ts`, never inline in routes.
- **Query conventions:** keys `["resource", id, "sub"]`, list keys end with the filter object; `enabled: id > 0` guards; URLSearchParams builder functions for query strings; mutations bundled in `useXMutations()` where each `onSuccess` calls `qc.invalidateQueries({ queryKey: ["resource"] })` (root key). Forgetting invalidation = stale UI.
- **Forms:** react-hook-form + `zodResolver`; import Zod as `import * as z from "zod/v4"`. Nullable numbers use the house idiom `z.preprocess((v) => v === "" || v == null ? undefined : Number(v), z.number()...optional())`. Schemas live next to the form (`*.schemas.ts` / `networkFormSchema.ts` style).
- **Design system:** tokens live in `src/styles/globals.css` (`@theme` block). Weights: `font-emphasis` (510) and `font-strong` (590) — **never `font-bold`/700**. Semantic classes (`text-muted-foreground`, `bg-card`, `border-border`), merge with `cn()`, variants with `cva` following `components/ui/button.tsx`. Severity/status badges copy the existing `SeverityBadge` pattern (raw `red/orange/yellow/blue-500` with `/10` bg + `/20` border) — do not invent a third color scheme.
- **TypeScript:** `verbatimModuleSyntax` is on — type-only imports MUST use `import type`. Named exports only (no default exports). `@/*` alias for all cross-module imports.
- **Tests:** vitest + Testing Library, co-located `X.test.tsx`. Hook tests: fresh `QueryClient` wrapper (`retry: false, gcTime: 0`), `useAuthStore.setState({ token })`, `vi.stubGlobal("fetch", mockFetch)`, assert URLs via `mockFetch.mock.calls`.
- **Any UI change requires browser verification** at http://localhost:5173 (login `admin@example.com` / `admin`) before it counts as done. Screenshot when helpful.

## 5. Scanner Rules (`scanner/src`)

- DTOs are **frozen dataclasses** in `models.py` — not Pydantic. Poll loop in `main.py`; phase pipeline in `orchestration.py`; all HTTP in `client.py`.
- **Three extension patterns — pick the right one:**
  1. Port scanner (CIDR in, ports out): implement `ScannerProtocol` (`scanners/base.py`), register in `scanners/__init__.py`.
  2. Post-discovery vulnerability phase (targets = already-discovered `IP:PORT`): nuclei style — module functions + a `phase.tool` branch in `_run_vulnerability_phase` + an `_ensure_*_phase` injector in `orchestration.py`.
  3. Entirely different job kind: greenbone style — own `process_*_job` path outside the pipeline.
- **Failure isolation is a hard invariant.** `port_scan`, `host_discovery`, and `nse` phases MAY fail the scan. Nuclei, hostname enrichment, progress reporting, and log submission are best-effort: wrap everything, log a warning, return empty — a broken post-phase must never fail a successful port scan.
- **Every subprocess argument derived from job input goes through `sanitize_cidr` / `sanitize_port_spec` (`utils.py`) first.** No exceptions — these are the command-injection barrier.
- Background threads (`LogStreamer`, `ProgressReporter`, `ScanCancellationWatcher`, `ProcessTimeoutWatcher`) share one httpx client serialized by `client._http_lock` — new background HTTP calls must go through `client` methods. Stop + join watchers in `finally`.
- Timeout semantics differ: masscan raises `TimeoutError`; nuclei returns `timed_out=True` with empty results. Match the pattern of the phase type you're extending.
- GVM: `scanner/src/scanners/greenbone.py` and `greenbone_metadata.py` carry `SPDX: BUSL-1.1 OR GPL-3.0-or-later` headers — keep them when editing. GVM configs/port lists are always referenced **by name, never UUID**. Greenbone jobs submit vulnerabilities BEFORE open_ports (open_ports flips the scan to COMPLETED; the vuln endpoint requires RUNNING).
- Tests mock all subprocess/network (`_FakeProcess` pattern in `test_nuclei.py`, `_FakeGmp` in `test_greenbone.py`). Never spawn real masscan/nmap/nuclei in tests.

## 6. Named Mistakes → Preventing Rules

| # | Mistake (named) | Rule that prevents it |
|---|---|---|
| 1 | **The Service Commit** — `db.commit()` inside a service | Commit only in the router, after the service call. Services flush + refresh. |
| 2 | **The Ghost API Layer** — importing `client` from `api-client.ts` / `api-types.ts` | `fetchApi` + `lib/types.ts` is the only live API layer. |
| 3 | **The Gen-File Edit** — hand-editing `routeTree.gen.ts` | New route = new file in `src/routes/`. The tree regenerates itself. |
| 4 | **The jose Import** — following AGENTS.md's python-jose note | PyJWT: `import jwt`, `from jwt.exceptions import PyJWTError`. |
| 5 | **The Silent NULL** — nullable update field without `clear_*` flag | Wire schema + service param + `clear_x` param + `model_fields_set` derivation. |
| 6 | **The Enum Name Leak** — enum column without `values_callable` | Always `values_callable=lambda x: [e.value for e in x]`. |
| 7 | **The Orphan Model** — new model missing from `models/__init__.py` | Register every model there; Alembic and `relationship()` strings depend on it. |
| 8 | **The Guessed down_revision** — assuming migration numbering is linear | Run `alembic heads` inside the container; chain to the real head; add idempotency guards. |
| 9 | **The Eager Assumption** — touching a relationship after the session (MissingGreenlet) | Add `selectinload()` to the specific query; nothing eager-loads by default. |
| 10 | **The Skipped Changelog** — committing without a CHANGELOG entry | Every feat/fix/refactor/security commit edits `[Unreleased]` with a `**Layer**:` paragraph. |
| 11 | **The Layer Split** — separate backend and frontend commits for one feature | Vertical slice: one commit across all layers + migration + tests + CHANGELOG. |
| 12 | **The npx tsc Reflex** | `npm run typecheck` / `just frontend-typecheck`. |
| 13 | **The font-bold Reflex** (or hardcoded hex colors) | `font-emphasis`/`font-strong`; tokens from `globals.css`; severity badges copy `SeverityBadge`. |
| 14 | **The Fatal Post-Phase** — letting nuclei/enrichment errors fail a scan | Post-phases are best-effort: catch everything, warn, return empty. |
| 15 | **The Unsanitized Subprocess** — job input straight into a command line | `sanitize_cidr` / `sanitize_port_spec` before every subprocess. |
| 16 | **The Stale Scanner** — expecting scanner hot-reload | `docker compose -f compose-dev.yml restart scanner` after scanner edits. |
| 17 | **The Missing import type** — plain import of a type under `verbatimModuleSyntax` | `import type { X } from "@/lib/types"`. |
| 18 | **The Trust-the-CI Fallacy** — "the pipeline will catch it" | CI checks nothing on push and only frontend typecheck on tags. `just check` locally is the gate. |
| 19 | **The Naked dict** — `dict`/`list` without type params under mypy strict | `dict[str, Any]`, `list[Network]` — always parameterized. |
| 20 | **The UUID Config** — passing GVM config/port-list UUIDs | GVM library entries and network config reference names, never UUIDs. |
| 21 | **The Naive-Aware Mix** — comparing DB datetimes with aware datetimes | DB is naive UTC; `.replace(tzinfo=timezone.utc)` on read, `datetime.now(timezone.utc)` on write. |
| 22 | **The Default Export** — `export default` in frontend code | Named exports only (only `routeTree.gen.ts` is exempt). |

## 7. Quality Bar Per Deliverable (checkable)

**Backend endpoint** is done when:
- [ ] Schemas named `XCreateRequest`/`XUpdateRequest`/`XResponse`(/`XListResponse`), `response_model=` and explicit `status.HTTP_*` codes set
- [ ] Service returns value/None; router raises 404/409; `db.commit()` in router
- [ ] Nested resources validated against parent (`rule.network_id == network_id`)
- [ ] Tests cover happy path + 401/403 + 404 in `tests/test_<domain>.py` using existing fixtures
- [ ] `just backend-check` green; CHANGELOG entry written

**Migration** is done when:
- [ ] Generated via `just migrate "desc"` and hand-reviewed (autogenerate output is a draft, not truth)
- [ ] `down_revision` equals current `alembic heads` output
- [ ] Idempotency guards for added columns/tables (information_schema checks)
- [ ] Model registered in `models/__init__.py`; backend container restarts cleanly (check `just dev-logs-backend`)
- [ ] Backend test suite still passes on SQLite

**Frontend feature** is done when:
- [ ] Types in `lib/types.ts` mirror the Pydantic response exactly
- [ ] Hook in `features/<x>/hooks/` with conventional query key, `enabled` guard, mutations invalidating the root key
- [ ] Route thin; loading/error via `LoadingState`/`ErrorState`; design tokens only (no `font-bold`, no hex)
- [ ] `import type` used for types; named exports only
- [ ] `just frontend-check` green; **verified in the browser at :5173**; CHANGELOG entry written

**Scanner change** is done when:
- [ ] Correct extension pattern chosen (§5); failure-isolation invariant respected
- [ ] Sanitizers applied before subprocess; watchers stopped in `finally`
- [ ] Tests use fake subprocess/GMP objects — nothing real spawned
- [ ] `cd scanner && uv run mypy src/ && uv run ruff check src/` green; container restarted and `just dev-logs-scanner` clean; SPDX headers intact on GVM files

**Bug fix** is done when:
- [ ] Root cause identified and named in the commit body (mechanism, not symptom)
- [ ] A regression test exists that fails without the fix
- [ ] CHANGELOG `Fixed` entry describes the mechanism
- [ ] Affected stack's checks green

**Commit** is done when:
- [ ] `<type>: <imperative description>` without trailing period, no co-author line
- [ ] Body explains why + scoping decisions + how verified
- [ ] CHANGELOG updated in the same commit (unless pure chore/docs)
- [ ] All checks for touched stacks pass BEFORE committing

**Release** is done when:
- [ ] Tree clean, `[Unreleased]` curated (entries in right categories, tightened)
- [ ] `just release <type>` run interactively; tag pushed; CI tag workflow green

## 8. When Uncertain — Escalation Rules

1. **Docs vs. code conflict → code wins.** Note the drift in your final report. Known stale claims: AGENTS.md's python-jose note (it's PyJWT), AGENTS.md's blanket "use selectinload" (it's per-query), `docs/development/architecture.md` says React 18 (it's 19), contributing.md mentions bun (it's npm).
2. **Two coexisting patterns** (BaseRepository vs. direct `select()`; `core/exceptions.py` vs. raw `HTTPException`): match the file you're editing; for new files use the dominant pattern (direct select, raw HTTPException, `fetchApi`). Never refactor one into the other as a side effect.
3. **Ask before acting** (stop, present a concrete recommendation) when: adding a dependency, adding a table when a column was asked for, changing API response shapes consumed by the scanner protocol, changing alert semantics/thresholds, anything touching auth flows, naming/UX decisions with no precedent in the codebase.
4. **Never without explicit instruction:** destructive DB ops (dropping columns/tables outside a reviewed migration), deleting/reordering existing migrations, force-push, touching `compose.yml`/prod env files, running `release.sh`.
5. **Security finding:** stop feature work, report it, grep for sibling instances, fix only critical ones immediately, never commit secrets, flag any exposed secret for rotation. Security fixes get their own `security:`-type commit with detailed mechanism.
6. **Stuck rule:** the same check fails after 2 genuinely different fix attempts → stop, write down findings and hypotheses, ask. Don't loop.
7. **Scope guard:** if the fix balloons past the named request (schema redesign, cross-cutting rename), stop and re-plan per `.claude/rules/workflow.md`.

## MCP: code-review-graph

Knowledge graph over the codebase (auto-updated by hooks). Use BEFORE file scanning:
`semantic_search_nodes` / `query_graph` (callers_of, callees_of, tests_for) for exploration, `get_impact_radius` + `get_affected_flows` for blast radius, `detect_changes` + `get_review_context` for review. Fall back to Grep/Glob/Read only when the graph doesn't cover it.
