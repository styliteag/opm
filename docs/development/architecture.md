# Architecture Overview

This document summarizes the current architecture of Onyx Port Monitor across frontend, backend, database, and scanner components.

It is intended as a practical orientation document for contributors. It focuses on the architecture that is actually implemented now, rather than older design intent.

## System Shape

Onyx Port Monitor is split into three main runtime parts plus the database:

1. frontend
2. backend API
3. scanner agents
4. MariaDB

At a high level:

- the frontend is an operator console
- the backend owns policy, persistence, scheduling, and aggregation
- scanners are remote executors that perform network-facing work
- the database stores the historical state that ties scans, hosts, alerts, and rules together

## Frontend

Current stack:

- React 18
- TypeScript
- Vite
- TanStack Router (file-based routing)
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS

Primary routes visible in the app today:

| Route | Purpose |
|-------|---------|
| `/` | dashboard |
| `/scanners` | scanner management |
| `/networks` | network inventory |
| `/networks/:id` | network detail |
| `/scans` | scan history |
| `/scans/:id` | scan detail |
| `/hosts` | hosts and ports overview |
| `/hosts/:hostId` | host detail (ports, alerts, SSH, rules) |
| `/alerts` | alert review queue |
| `/alerts/:id` | alert detail |
| `/port-rules` | unified alert rules page |
| `/trends` | historical charts |
| `/nse/profiles` | NSE scan profile management |
| `/nse/library` | NSE script library |
| `/nse/editor/:scriptName` | NSE script editor |
| `/nse/results` | NSE vulnerability scan results |
| `/admin/users` | admin-only user management |
| `/admin/roles` | admin-only role management |
| `/admin/organization` | admin-only org settings |

The frontend is organized by feature modules in `src/features/` (admin, alerts, auth, dashboard, hosts, networks, nse, scanners, scans), with shared components in `src/components/` and the API layer in `src/lib/`. Routes live in `src/routes/` using TanStack Router's file-based routing convention. It contains a fair amount of workflow logic around alert review, filtering, scanner administration, host detail views, and rule management, with TanStack Query acting as the main synchronization layer with the backend.

## Backend

Current stack:

- FastAPI
- SQLAlchemy async ORM
- Pydantic v2
- Alembic
- APScheduler

Main router groups currently registered by `backend/src/app/main.py`:

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | user auth (JWT login/logout) |
| `/api/alerts` | alert review, comments, assignment, severity, exports |
| `/api/global-ports` | deduplicated global open ports |
| `/api/settings` | system-wide global settings |
| `/api/hosts` | host overview, host actions, timeline |
| `/api/metadata` | scanner type and alert type metadata |
| `/api/networks` | network CRUD, scans, port rules |
| `/api/nse` | NSE script management, profiles, results, sync status |
| `/api/organization` | organization settings |
| `/api/port-rules` | unified alert rules for port and SSH sources |
| `/api/ports` | port-oriented views |
| `/api/roles` | RBAC role management |
| `/api/scanner` | scanner-to-backend protocol (jobs, results, logs, progress) |
| `/api/scanners` | scanner CRUD, API key generation/regeneration |
| `/api/scans` | scan list/detail/logs, diff, cancel, CSV/PDF export |
| `/api/ssh` | SSH findings, history, dismiss, recheck, reopen |
| `/api/trends` | trend aggregates (alerts, hosts, open ports) |
| `/api/users` | user CRUD |
| `/api` | version metadata |
| `/health` | health check |

The backend follows a mostly conventional FastAPI layering:

- routers handle HTTP concerns
- services hold business logic
- models define persistence
- schemas define typed request and response payloads

The important architectural point is that alert generation, scan scheduling, and policy evaluation are backend concerns, not scanner concerns.

## Scanner Agents

Scanner agents are external workers that poll the backend for work.

Current behavior:

- authenticate with API key plus short-lived scanner JWT
- poll for port-scan jobs
- poll for host-discovery jobs
- run `masscan` (port discovery), `nmap` (service detection + banners), `nse` (vulnerability scripts), and SSH probing
- perform hostname enrichment via DNS reverse lookups
- cache NSE scripts locally with content hash and ETag support
- stream logs and progress (batched every ~5 seconds)
- submit results for persistence and alert generation

This design keeps scanners stateless enough to deploy near the networks they observe. A scanner does not need the full business context of the application; it only needs enough context to execute a job safely and report back.

## Data Model

The most important active tables are:

| Table | Purpose |
|-------|---------|
| `users` | local user accounts |
| `organizations` | multi-tenant organization support |
| `scanners` | registered scanner agents and API key hashes |
| `networks` | scan targets and policy config |
| `scans` | scan executions, progress, errors, single-host target support |
| `open_ports` | per-scan open-port records |
| `global_open_ports` | cross-scan deduplicated open ports |
| `hosts` | discovered hosts and host-level metadata |
| `alerts` | generated alerts |
| `alert_comments` | discussion and review notes |
| `alert_rules` | unified accepted/critical rules across `port` and `ssh` sources |
| `port_rules` | per-network allow/block port rules |
| `global_port_rules` | global allow/block port rules |
| `ssh_scan_results` | SSH probe results |
| `nse_templates` | NSE scan profile metadata |
| `nse_scripts` | individual NSE scripts |
| `nse_results` | per-scan NSE vulnerability findings |
| `host_discovery_scans` | discovery-job tracking |
| `scan_logs` | streamed scanner logs |
| `global_settings` | shared system-wide settings |

If you are new to the schema, the easiest way to think about it is as four connected domains:

1. inventory: `networks`, `hosts`, `global_open_ports`
2. execution history: `scans`, `scan_logs`, `host_discovery_scans`
3. findings: `open_ports`, `ssh_scan_results`, `alerts`
4. policy and collaboration: `alert_rules`, `alert_comments`, assignments, user accounts

## Notable Model Details

These are the areas that most often drift in stale documentation:

- active alert-rule management is centered on `alert_rules`, exposed via `/api/port-rules`
- alerts carry a `source` field, not just a type
- alerts support `severity_override`
- scans support `target_ip` for single-host rescans
- scans support visibility toggling (hide from analytics)
- networks include `scanner_type`, `scan_protocol`, `scan_timeout`, `port_timeout`, `host_discovery_enabled`, and `nse_profile_id`
- SSH findings are persisted in `ssh_scan_results`
- NSE templates, scripts, and results are stored in dedicated tables
- organizations support multi-tenant isolation
- RBAC roles are managed via `/api/roles`

Those items are where stale documentation most often goes wrong, so they are worth checking first whenever older notes or diagrams disagree with the code.

## Scan Lifecycle

Scan status values:

- `planned`
- `running`
- `completed`
- `failed`
- `cancelled`

Trigger types:

- `manual`
- `scheduled`

Typical flow:

1. A user or scheduler creates a `planned` scan.
2. A scanner polls for jobs and claims the network.
3. The backend marks the scan `running`.
4. The scanner streams progress and logs during execution.
5. The scanner submits results.
6. The backend stores ports, hosts, SSH findings, and generated alerts.

For contributors, the key architectural split is:

- scanners discover and submit facts
- backend services decide what those facts mean operationally

If a scan is cancelled mid-flight:

- the backend may still accept partial results
- the final scan status remains `cancelled`
- alert generation only runs for completed scans

## Scheduling

The backend scheduler evaluates cron schedules every minute using APScheduler.

Important current behavior:

- schedules use `SCHEDULE_TIMEZONE` when configured
- otherwise schedules use the server local timezone
- row locking is used to prevent duplicate scheduled scans across concurrent workers

The locking detail matters because the backend may run with multiple workers. Without that protection, scheduled scans could be created more than once for the same network and minute boundary.

## Alert Generation

Alert generation is backend-driven and occurs after successful scan result processing.

Current sources:

- port findings (new_port, not_allowed, blocked)
- SSH security findings (ssh_insecure_auth, ssh_weak_cipher, ssh_weak_kex, ssh_outdated_version, ssh_config_regression)
- NSE vulnerability findings (CVE extraction from scan results)

Important alert concepts:

- alerts are deduplicated while active
- accepted rules suppress future matching alerts
- critical rules can elevate severity to `critical`
- dismissing an alert and accepting an alert are different operations

That last distinction is operationally important:

- dismiss = queue visibility / review state
- accept = policy change that suppresses future matching alerts

## Development Runtime

The local development stack from `compose-dev.yml` is:

- `opm-db`
- `opm-backend`
- `opm-frontend`
- `opm-scanner`

Reload behavior:

- backend: reload enabled
- frontend: Vite HMR
- scanner: manual restart required

That asymmetry is easy to forget. Backend and frontend changes normally appear immediately in dev; scanner changes do not.

## Code Layout

### Backend

| Path | Purpose |
|------|---------|
| `backend/src/app/models/` | ORM models |
| `backend/src/app/schemas/` | request/response schemas |
| `backend/src/app/services/` | business logic |
| `backend/src/app/routers/` | HTTP route handlers |
| `backend/src/migrations/` | Alembic migrations |

### Frontend

| Path | Purpose |
|------|---------|
| `frontend/src/routes/` | TanStack Router file-based route pages |
| `frontend/src/features/` | domain-organized feature modules (components, hooks, schemas) |
| `frontend/src/components/` | shared reusable UI (ui/, layout/, data-display/, feedback/) |
| `frontend/src/lib/` | API client, types, query client, utilities |

### Scanner

| Path | Purpose |
|------|---------|
| `scanner/src/main.py` | startup and poll loop |
| `scanner/src/client.py` | API client |
| `scanner/src/orchestration.py` | scan workflow |
| `scanner/src/discovery.py` | host discovery |
| `scanner/src/ssh_probe.py` | SSH probing |
| `scanner/src/hostname_enrichment.py` | DNS reverse lookups |
| `scanner/src/script_cache.py` | NSE script caching |
| `scanner/src/threading_utils.py` | log buffering |
| `scanner/src/scanners/` | scanner backends (masscan, nmap, nse) |

## Related Docs

- [Development setup](setup.md)
- [Scanner architecture](../scanner/architecture.md)
- [Alert states](../alert-states.md)
