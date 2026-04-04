# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For full conventions, architecture, and patterns: @AGENTS.md

## Design System

All frontend UI work must follow `DESIGN.md` (Linear-inspired). Key rules:
- **Font**: Inter Variable with `font-feature-settings: "cv01", "ss03"` — no other display fonts
- **Weights**: 400 (read), 510 (`font-emphasis`), 590 (`font-strong`) — never use `font-bold` (700)
- **Accent**: Indigo-violet (#5e6ad2 / #7170ff / #828fff) — only chromatic color in the system
- **Surfaces**: #0f1011 (bg), #191a1b (elevated), rgba(255,255,255,0.02) (cards)
- **Borders**: Semi-transparent white (`rgba(255,255,255,0.05)` to `rgba(255,255,255,0.08)`)
- **Text**: #f7f8f8 (primary), #d0d6e0 (secondary), #8a8f98 (tertiary), #62666d (quaternary)
- **Severity colors** (red/orange/yellow/blue) are functional status indicators — keep them

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

## Project

**Alert-to-Resolution Workflow**

Optimizing the daily operations workflow in STYLiTE Orbit Monitor — from receiving alerts to resolving them over days/weeks of recurring scans. The focus is on making the multi-day alert lifecycle visible, enabling direct editing of hosts and ports, and automatically reopening resolved alerts when the underlying issue recurs.

**Core Value:** A user can wake up, see what changed since yesterday's scan, and track every alert from discovery to resolution without losing context across days.

### Constraints

- **Tech stack**: Must use existing stack (FastAPI, React, TanStack Query, MariaDB)
- **Performance**: Timeline queries must not degrade alert list performance — likely needs dedicated endpoint
- **Backward compatible**: Existing alert workflows (dismiss, accept, bulk ops) must continue working unchanged
- **Migration**: Schema changes need Alembic migrations (auto-applied on startup)

## Technology Stack

## Languages
- **Python** 3.12 - Backend API and scanner agent
- **TypeScript** 5.9.3 - Frontend React application
- **Lua** 5.4 - NSE (Nmap Script Engine) execution in scanner
- **SQL** - MariaDB schema and migrations (Alembic)
- **Bash** - Startup scripts and container initialization
## Runtime
- **Python 3.12** - FastAPI backend, Python package manager
- **Node.js** 20 - Frontend build and development
- **Container Runtime** - Docker/Docker Compose (all services containerized)
- **uv** (Python) - Version not specified in pyproject.toml; used for `uv sync`, `uv run`
- **npm** (Node.js) - Frontend dependencies via `package.json` with `package-lock.json`
## Frameworks
- **FastAPI** ≥0.115.0 - Async REST API framework
- **SQLAlchemy** ≥2.0.0 with asyncio - Async ORM for database models
- **Uvicorn** ≥0.32.0 (with `standard` extras) - ASGI server for FastAPI
- **Pydantic** ≥2.10.0 - Data validation and schema serialization
- **Pydantic-Settings** ≥2.6.0 - Environment-based configuration management
- **Alembic** ≥1.14.0 - Database schema versioning and migrations
- **MariaDB** 11 - Primary database (MySQL-compatible)
- **React** 19.2.4 - UI framework
- **Vite** 8.0.1 - Build tool and dev server
- **TanStack Router** 1.168.2 - File-based routing (not React Router)
- **TanStack Query** (React Query) 5.94.5 - Server state management
- **TanStack Table** 8.21.3 - Data table component library
- **TypeScript** 5.9.3 - Type-safe JavaScript
- **Tailwind CSS** 4.2.2 - Utility-first CSS framework
- **Tailwind Animate** 1.0.7 - Animation utilities
- **Class Variance Authority** 0.7.1 - Component variant management
- **Lucide React** 0.577.0 - Icon library
- **Radix UI** (via `@radix-ui/react-slot` 1.2.4) - Accessible UI primitives
- **Base UI** 1.3.0 - Headless component library
- **shadcn** 4.1.0 - Pre-built Tailwind + Radix UI component set
- **React Hook Form** 7.72.0 - Form state and submission
- **Zod** 4.3.6 - TypeScript-first schema validation
- **@hookform/resolvers** 5.2.2 - Integration layer for Zod with React Hook Form
- **CodeMirror 6** (via `@uiw/react-codemirror` 4.25.8) - Code editing for NSE scripts
- **Zustand** 5.0.12 - Lightweight state management (auth store)
- **openapi-fetch** 0.17.0 - Type-safe OpenAPI client (precursor to generated API types)
- **cron-parser** 5.5.0 - Parse cron expressions client-side
- **cronstrue** 3.14.0 - Convert cron to human-readable text
- **Recharts** 3.8.0 - React chart library (for trends dashboard)
- **Sonner** 2.0.7 - Toast notification library
- **clsx** 2.1.1 - Classname conditional utility
- **Tailwind Merge** 3.5.0 - Prevent Tailwind CSS conflicts
- **Geist Font** 5.2.8 - Modern variable font
- **pytest** ≥8.0.0 - Test framework
- **pytest-asyncio** ≥0.24.0 - Async test support
- **aiosqlite** ≥0.20.0 - SQLite async driver for in-memory test databases
- **mypy** ≥1.13.0 - Static type checking (strict mode enabled)
- **ruff** ≥0.8.0 - Fast Python linter (rules: E, F, I, W; 100-char line limit)
- **Vitest** 4.1.0 - Unit test framework (Vite-native)
- **@vitest/coverage-v8** 4.1.0 - Code coverage
- **@testing-library/react** 16.3.2 - React component testing utilities
- **@testing-library/jest-dom** 6.9.1 - DOM matchers for tests
- **jsdom** 29.0.1 - DOM implementation for Node.js tests
- **ESLint** 9.39.4 - JavaScript linting
- **Prettier** 3.8.1 - Code formatter (configured with ESLint)
- **TypeScript ESLint** 8.57.0 - TypeScript support for ESLint
- **@vitejs/plugin-react** 6.0.1 - React plugin for Vite
- **@tanstack/router-plugin** 1.167.3 - TanStack Router code generation
- **openapi-typescript** 7.13.0 - Generate TypeScript types from OpenAPI schema
- **httpx** ≥0.28.0 - HTTP client for backend communication
- **Pydantic** ≥2.10.0 - Data validation for scan jobs/results
- **Pydantic-Settings** ≥2.6.0 - Scanner configuration from environment
- **masscan** - High-speed port scanner (pre-installed in container image)
- **nmap** - Service detection, host discovery, NSE execution
- **lua5.4** - Runtime for NSE scripts
## Key Dependencies
- **FastAPI** - Core REST API framework; all endpoints depend on it
- **SQLAlchemy 2.0** with asyncio - Critical for all database operations; strict async mode required
- **Pydantic 2** - All request/response validation; strict mode enforced
- **React 19 + TypeScript** - Frontend application framework
- **TanStack Router** - File-based routing (NOT React Router); critical architectural choice
- **TanStack Query** - Server state and caching; required for pagination and real-time data
- **MariaDB 11** - Primary relational database (MySQL-compatible)
- **Docker/Docker Compose** - All services containerized; no local execution outside containers
- **Alembic** - Database schema migrations; auto-applied on backend startup
- **APScheduler** ≥3.10.0 - Scheduled scan job creation (every minute cron job)
- **aiosmtplib** ≥3.0.0 - Async SMTP client for email alerts
- **email-validator** ≥2.0.0 - Email address validation
- **PyJWT** ≥2.12.0 - JWT token generation and validation (HS256)
- **passlib[bcrypt]** ≥1.7.4 - Password hashing and API key hashing
- **reportlab** ≥4.0.0 - PDF report generation for scan exports
- **pillow** ≥12.1.1 - Image processing (used by reportlab)
- **httpx** ≥0.28.0 - HTTP client for scanner→backend and internal calls
- **python-multipart** ≥0.0.22 - Form data parsing (FastAPI requirement)
## Configuration
- **Backend config**: `backend/src/app/core/config.py` uses Pydantic Settings
- **Frontend config**: Environment variables prefixed with `VITE_`
- **Backend**: `backend/pyproject.toml`
- **Frontend**: `frontend/vite.config.ts`
- **Scanner**: `scanner/pyproject.toml` with hatchling build backend
## Platform Requirements
- Docker and Docker Compose installed
- Python 3.12 (for local backend testing)
- Node.js 20 (for frontend with npm or compatible package manager)
- Git
- Docker runtime (images built for multi-arch support)
- Deployment platforms: Any Docker-compatible host (cloud VPS, Kubernetes, bare metal)
- Network requirements: Outbound SMTP (587/TLS) for email alerts, DNS for reverse hostname lookups
- GitHub Actions CI/CD (tag-triggered Docker builds)
- Docker Hub and GitHub Container Registry (image hosting)
- NSE script sync from upstream nmap GitHub repository (automated during release)

## Conventions

## Naming Patterns
### Files
- Routers: `singular_noun.py` (e.g., `users.py`, `alerts.py`, `networks.py`)
- Services: `plural_noun.py` (e.g., `users.py`, `scanners.py`, `networks.py`)
- Models: `singular_noun.py` (e.g., `user.py`, `scan.py`, `network.py`)
- Schemas: `singular_noun.py` (e.g., `user.py`, `network.py`, `alert.py`)
- Components: `PascalCase.tsx` (e.g., `SeverityBadge.tsx`, `LoginForm.tsx`, `StatCard.tsx`)
- Hooks: `useHookName.ts` (e.g., `useLogin.ts`, `useHosts.ts`, `useDashboardData.ts`)
- Tests: `FileName.test.tsx` or `hookName.test.ts` (co-located with source)
- Stores: `storeName.store.ts` (e.g., `auth.store.ts`)
- Utilities: `kebab-case.ts` (e.g., `api.ts`, `utils.ts`, `types.ts`)
### Functions
- Use `snake_case` for all functions
- Async functions: `async def function_name()` (e.g., `async def get_all_users()`, `async def create_user()`)
- Service functions are verbs describing the operation: `get_*`, `create_*`, `update_*`, `delete_*`, `list_*`
- Router handlers are named after the operation: `list_items`, `create_item`, `get_item`, `update_item`, `delete_item`
- Use `camelCase` for all functions
- Custom hooks: `useXxx` convention mandatory (e.g., `useLogin`, `useHosts`, `useAlerts`)
- Helper functions: `camelCase` verbs (e.g., `extractErrorMessage`, `formatDate`, `calculateRisk`)
- Event handlers: `onEventName` (e.g., `onClick`, `onSubmit`, `onChange`)
### Variables
- Local variables: `snake_case`
- Class attributes: `snake_case`
- Enum values: `UPPER_CASE` (e.g., `UserRole.ADMIN`, `ScanStatus.COMPLETED`)
- Constants: `UPPER_CASE_WITH_UNDERSCORES`
- Local variables: `camelCase`
- Component props: `camelCase` with explicit types
- State variables: `camelCase` (e.g., `const [isLoading, setIsLoading] = useState()`)
- Constants: `UPPER_CASE` for true constants, `camelCase` for derived constants
### Types
- Model classes: `PascalCase` (e.g., `User`, `Network`, `Alert`, `Scan`)
- Enum classes: `PascalCase` (e.g., `UserRole`, `ScanStatus`, `AlertType`)
- Schema classes: `PascalCase` with suffixes: `*Request`, `*Response`, `*CreateRequest`, `*UpdateRequest` (e.g., `UserCreateRequest`, `UserResponse`, `UserListResponse`)
- Type hints use Python 3.12+ syntax: `str | None` not `Optional[str]`, `list[str]` not `List[str]`
- Interface types: `PascalCase` (e.g., `SeverityBadgeProps`, `LoginResponse`, `HostListResponse`)
- Type aliases: `PascalCase` (e.g., `Severity`, `AlertType`, `ResolutionStatus`)
- Union types: `'value1' | 'value2'` (literal string unions, e.g., `type Severity = 'critical' | 'high' | 'medium' | 'info'`)
- Component props interfaces: `ComponentNameProps` (e.g., `SeverityBadgeProps`, `StatCardProps`)
## Code Style
### Formatting
- Tool: `ruff` for linting and formatting
- Line length: 100 characters (configured in `backend/pyproject.toml`)
- Indentation: 4 spaces
- Imports: Organized by `isort` (part of ruff) - standard library, third-party, local imports in separate groups
- Tool: ESLint + Prettier
- Line length: Not enforced by formatter (code is readable)
- Indentation: 2 spaces
- Quotes: Single quotes (`'single'` not `"double"`)
- Trailing commas: Always (Prettier default)
### Linting
- Tool: `ruff check src/`
- Rules enforced: `E` (pycodestyle errors), `F` (pyflakes), `I` (isort imports), `W` (warnings)
- Run: `cd backend && uv run ruff check src/`
- Tool: ESLint (flat config in `frontend/eslint.config.js`)
- Extends: `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`
- Special rule: Route files (`src/routes/**/*.tsx`) disable `react-refresh/only-export-components` to allow layout exports
- Run: `cd frontend && npm run lint`
## Import Organization
### Backend (Python)
- Used to prevent circular imports in relationship type hints:
### Frontend (TypeScript)
- `@/*` resolves to `src/*` (configured in `frontend/tsconfig.json` and `frontend/vite.config.ts`)
- Always use `@/` prefix for imports from src directory (e.g., `@/components`, `@/features`, `@/lib`, `@/stores`)
- Use `import type { TypeName }` for types only (helps tree-shaking and clarity)
- Runtime values use regular imports
## Error Handling
### Backend (Python)
- Services return values or `None`; they do not raise HTTP exceptions
- Routers raise `HTTPException` with appropriate status codes and detail messages
- Use `status.HTTP_*` constants from `fastapi` (e.g., `status.HTTP_400_BAD_REQUEST`)
- `200 OK`: Successful GET, PUT, PATCH
- `201 CREATED`: Successful POST
- `204 NO_CONTENT`: Successful DELETE
- `400 BAD_REQUEST`: Invalid input, validation failure, duplicate entries
- `401 UNAUTHORIZED`: Missing or invalid authentication
- `403 FORBIDDEN`: Authenticated but insufficient permissions
- `404 NOT_FOUND`: Resource does not exist
- `409 CONFLICT`: Resource already exists or state conflict
- `422 UNPROCESSABLE_ENTITY`: Pydantic validation error (automatic from FastAPI)
- Use try-except for operational failures (file I/O, external API calls)
- Convert operational errors to meaningful messages for routers to raise as HTTPException
- Example in `backend/src/app/routers/nse.py`: catches `OSError` and `ValueError`, converts to HTTP 400/404
### Frontend (TypeScript)
- All API calls use the `fetchApi()` wrapper function from `@/lib/api.ts`
- Errors are thrown and caught by React Query mutation handlers
- User-facing errors displayed via toast notifications (using `sonner`)
- Network errors automatically logout user on 401
## Logging
### Backend (Python)
- Scanner uses `logging` for debug/info messages
- Backend uses direct logging only where necessary; prefer to return structured data
- Log buffer: Scanner batches logs and submits via `/api/scanner/logs` endpoint
### Frontend (TypeScript)
- Do NOT use `console.log()` in production code (enforced by global instructions)
- Use proper logging framework if needed (not currently implemented)
- Tests may use console for debugging
## Comments
### When to Comment
- Module docstrings: Always use `"""..."""` to describe module purpose
- Function docstrings: Use for public functions in services and routers
- Inline comments: Only for non-obvious logic or workarounds
- Component comments: Not typically used; props and types are self-documenting
- Complex logic: Inline comments for non-obvious behavior
- TODO/FIXME: Allowed for future work
### JSDoc/TSDoc
- Docstrings follow Google-style format (simple one-liner for most functions)
- Only public-facing functions need docstrings
- Not enforced; TypeScript types serve as documentation
- Props interfaces are self-documenting via type annotations
## Function Design
### Size
- Target: Functions under 50 lines
- Services: Typically 10-30 lines
- Routers: Typically 15-35 lines for single operations
- Target: Components and hooks under 50 lines where possible
- Custom hooks: 15-40 lines typical
- Test functions: 1-15 lines typical per test case
### Parameters
- Services: First parameter is `db: AsyncSession`, followed by domain parameters
- Routers: Dependency injection via FastAPI (e.g., `admin: AdminUser`, `db: DbSession`)
- Optional parameters use `= None` with `| None` type union
- Props are passed as a single object destructured in function signature
- Hooks accept configuration objects for options:
### Return Values
- Services return the created/updated domain object or `None` for not found
- Routers return Pydantic response models
- Hooks return TanStack Query results: `{ data, isLoading, error, isSuccess, mutate }`
- Components return JSX.Element (implicit)
- Utility functions return explicitly typed values
## Module Design
### Exports
- All functions in a service module are importable
- Models are typically accessed via `from app.models import Base` and then model classes directly
- Routers are imported by name in main app (e.g., `from app.routers import users`)
- Named exports for all components, hooks, utilities
- No default exports (enforces consistency)
- Example:
### Barrel Files
- Frontend uses `@/lib` barrel exports for API utilities (implicit via path alias)
- Backend: Each module is imported explicitly, no barrel files pattern observed
## Database and ORM Patterns
### SQLAlchemy 2.0 Conventions
- Use `Mapped[type]` annotations for all columns in SQLAlchemy 2.0
- Use `mapped_column()` for explicit column definitions
- Enum columns use `SQLEnum(EnumClass, values_callable=lambda obj: [e.value for e in obj])`
- Datetime columns use `DateTime` type with `func.now()` for server defaults
- Relationships use `Mapped[list["ModelName"]]` with `relationship()` helper
### Pydantic Patterns
- Request schemas: `*Request`, `*CreateRequest`, `*UpdateRequest` suffixes
- Response schemas: `*Response` suffix, with `model_config = {"from_attributes": True}` for ORM conversion
- List responses: Wrapper schema with `items: list[ItemResponse]` field
- Use Pydantic `EmailStr` for email fields (validates format)
- Use `field_validator` decorator for custom validation
- Type unions: `str | None` for optional fields (not `Optional[str]`)
## Frontend State Management
### Zustand Stores
- Stores in `src/stores/*.store.ts`
- Persist middleware for localStorage (e.g., auth token)
- Example: `useAuthStore` with `login()`, `logout()` methods
- Accessed via `useAuthStore((state) => state.field)` or `useAuthStore.getState()`
### TanStack Query
- Query hooks for fetching: `useQuery()`
- Mutation hooks for modifying: `useMutation()`
- Query client configured in `src/lib/query-client.ts`
- Default options: `retry: false`, `gcTime: 0` for tests

## Architecture

## Pattern Overview
- **Layered Backend**: Routers → Services → Models (thin HTTP handlers delegate to business logic)
- **Distributed Scanning**: Stateless scanner agent polls backend for jobs via REST API
- **Event-Driven Alerts**: Database triggers and scheduled tasks generate alerts from scan results
- **File-Based Frontend Routing**: TanStack Router with feature modules organized by domain
- **Async-First Python**: FastAPI (backend) and async scanner agent with SQLAlchemy 2.0 ORM
- **Type-Safe**: Strict mypy (backend/scanner), strict TypeScript (frontend)
## Layers
### Backend (FastAPI) - `backend/src/app/`
- Location: `backend/src/app/core/`
- Purpose: Application infrastructure (database, auth, dependencies, configuration)
- Contains:
- Depends on: External packages (SQLAlchemy, FastAPI, pydantic)
- Used by: All routers and services
- Location: `backend/src/app/models/`
- Purpose: SQLAlchemy ORM models representing database tables
- Contains: 22 models (User, Scanner, Network, Scan, OpenPort, Alert, AlertRule, PortRule, Host, NseScript, NseTemplate, NseResult, SSHScanResult, HostDiscoveryScan, ScanLog, AlertComment, GlobalOpenPort, GlobalPortRule, GlobalSetting, etc.)
- Pattern: SQLAlchemy 2.0 with `Mapped[]` generic types + `mapped_column()` for type safety
- Depends on: Core layer, external ORM
- Used by: Services for database operations
- Location: `backend/src/app/schemas/`
- Purpose: Pydantic v2 request/response validation schemas
- Contains: 19 schema modules (separate file per domain: auth, alerts, hosts, networks, scans, etc.)
- Pattern: Input schemas for requests, output schemas for API responses with `from_attributes=True` for model conversion
- Depends on: Models (for field definitions)
- Used by: Routers (request/response validation)
- Location: `backend/src/app/services/`
- Purpose: Domain-specific business logic with no HTTP concerns
- Contains: 31 service modules organized by domain (auth, alerts, hosts, networks, scans, scanner management, etc.)
- Examples:
- Depends on: Models, core layer, external libraries
- Used by: Routers, other services
- Location: `backend/src/app/routers/`
- Purpose: FastAPI endpoints; thin handlers that delegate to services
- Contains: 21 router modules (auth, alerts, hosts, networks, scans, scanner, scanners, nse, ports, roles, users, trends, etc.)
- Pattern:
- Depends on: Schemas, services, core dependencies
- Used by: FastAPI app (registered in `main.py`)
- Location: `backend/src/app/main.py`
- Contains: FastAPI app initialization, CORS middleware, router registration, lifespan handler
- Lifespan Handler:
### Frontend (React) - `frontend/src/`
- Location: `frontend/src/routes/`
- Purpose: TanStack Router file-based routing structure
- Contains:
- Pattern: Nested routes with layout components; file path = URL structure
- Depends on: Stores, hooks, features
- Used by: TanStack Router to render components
- Location: `frontend/src/features/`
- Purpose: Domain-organized business logic and UI components
- Contains: 9 feature modules (admin, alerts, auth, dashboard, hosts, networks, nse, port-rules, scanners, scans)
- Each Feature Contains:
- Examples:
- Depends on: Shared components, lib/API
- Used by: Route components
- Location: `frontend/src/components/`
- Purpose: Reusable UI components across features
- Organized by Category:
- Depends on: Tailwind CSS
- Used by: Features and routes
- Location: `frontend/src/lib/`
- Purpose: API communication, types, utilities
- Contains:
- Depends on: Zod validation, external API
- Used by: Features, hooks
- Location: `frontend/src/stores/`
- Purpose: Global state (auth token, current user, theme)
- Contains: `auth.store.ts` for JWT token and authentication state
- Pattern: Zustand stores
- Depends on: localStorage
- Used by: Routes and hooks
### Scanner Agent - `scanner/src/`
- Location: `scanner/src/main.py`
- Purpose: Main loop for job polling
- Logic:
- Depends on: Client, orchestration, config
- Location: `scanner/src/client.py`
- Purpose: Backend API communication (job polling, result submission, logging)
- Methods: `get_jobs()`, `claim_job()`, `submit_results()`, `get_host_discovery_jobs()`, `claim_host_discovery_job()`, etc.
- Auth: Bearer token (short-lived scanner JWT from `generate_scanner_token`)
- Depends on: HTTP requests, models
- Location: `scanner/src/orchestration.py`
- Purpose: Job processing pipeline and scanner coordination
- Functions:
- Pattern: Phase pipeline with progress reporting
- Depends on: Scanners (registry), discovery, SSH probing, result models
- Location: `scanner/src/scanners/`
- Purpose: Scanner type registry and implementations
- Contains:
- Pattern: Registry pattern allows extensible scanner types
- Depends on: External binaries (masscan, nmap), models
- Location: `scanner/src/discovery.py`, `scanner/src/ssh_probe.py`, `scanner/src/hostname_enrichment.py`
- Purpose: Host discovery, SSH probing, DNS enrichment
- Functions:
- Depends on: External binaries, models
- Location: `scanner/src/threading_utils.py`, `scanner/src/script_cache.py`, `scanner/src/models.py`
- Purpose: Logging batch buffer, NSE script caching, Pydantic models
- Contains:
- Depends on: External packages, HTTP client
## Data Flow
### Scan Execution Flow (Port Scan)
### Alert Generation Flow
### Authentication Flow
## State Management
### Backend State
- Stored in: MariaDB database via SQLAlchemy ORM
- Transactions: Handled by FastAPI dependency `get_db()` with try/except rollback on error
- Consistency: `db.commit()` called in routers after service operations
- Stored in: APScheduler job store (configurable, defaults to memory)
- Purpose: Periodically creates `Scan` records for scheduled networks every minute
- Depends on: Configuration for schedule persistence
- Risk scores: Calculated per-request from open ports and SSH results
- Alert severity: Computed from alert rules, dismissed status, port rules
- Deduplication: Alerts deduplicated by `(alert_type, ip, port)` while `dismissed=false`
### Frontend State
- Stored in: `localStorage['opm-auth-token']` + Zustand store `auth.store.ts`
- Contains: JWT token, current user object, isAuthenticated flag
- Persistence: localStorage survives page reload
- Managed by: TanStack Query (React Query)
- Caching: Automatic caching and invalidation on mutations
- Sync: `api-client.ts` functions use Query hooks for automatic refetching
- Stored in: `localStorage` via ThemeContext
- Options: Light/dark mode preference
## Key Abstractions
### Scanner Registry
- Backend defines available scanner types (masscan, nmap, nse)
- Scanner agent imports implementations and registers them
- Lookup: `get_scanner(scanner_type: str)` → Returns scanner instance
- `scanner/src/scanners/masscan.py` — Implements `BaseScanner` interface
- `scanner/src/scanners/nmap.py` — Implements `BaseScanner` interface
- `scanner/src/scanners/registry.py` — Registry lookup and registration
### Alert Type Registry
- Backend defines discoverable alert types
- Services like `alert_generation.py` query registry for generators
- Each generator checks scan results, creates alerts if conditions match
- `services/alert_generation.py` — Calls registered generators
- `services/ssh_alert_generation.py` — SSH-specific alert logic
### Service Layer Pattern
```python
```
## Entry Points
### Backend
- Initialize FastAPI app
- Register CORS middleware
- Initialize database schema (if needed)
- Start APScheduler for periodic tasks
- Register all 21 routers
### Frontend
- Set up QueryClientProvider for server state
- Set up Toaster for notifications
- Render Outlet for nested routes
### Scanner
- Load configuration (backend URL, API key, etc.)
- Check external dependencies (masscan, nmap installed)
- Validate backend connectivity
- Start infinite polling loop for jobs
- Graceful shutdown on signal
## Error Handling
- Services raise domain exceptions or return None
- Routers catch exceptions, convert to HTTPException with appropriate status codes
- FastAPI exception handlers can be defined for custom exceptions
- Database errors: Caught in `get_db()` dependency, transaction rolled back
- Process functions catch exceptions, log with full traceback
- Submit failure results back to backend with error message
- Main loop catches all exceptions to prevent crash
- Graceful degradation: Skip failed jobs, continue polling
- API client wraps fetch errors in standardized error responses
- React Query handles request failures with retry logic
- UI components show toast notifications for errors
- Auth errors trigger login redirect
## Cross-Cutting Concerns
- Backend: `logging` module with FastAPI integration, configured in startup
- Scanner: Batched logging via `threading_utils.LogBufferHandler`, submitted to `/api/scanner/logs`
- Frontend: Browser console logs for debugging
- Backend: Pydantic schemas validate request payloads, custom field_validators for business logic
- Scanner: Pydantic models validate job payloads and result structures
- Frontend: Zod schemas validate form inputs before submission
- Backend: JWT tokens verified in `get_current_user()` dependency
- Scanner: Short-lived JWT tokens with `scope='scanner'` verified in `get_current_scanner()`
- Frontend: Bearer token in Authorization header for all requests
- Backend: Role-based access control via `AdminUser`, `OperatorUser`, `AnalystUser` dependencies
- Services check RBAC in business logic (e.g., user can only see own networks)
- Frontend: Routes check `current_user.role` to show/hide features
- Backend: In-memory sliding window rate limiter (configurable per endpoint)
- Uses `threading.Lock` for thread safety
