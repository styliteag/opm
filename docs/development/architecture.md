# Architecture Overview

This document summarizes the current architecture of Open Port Monitor across frontend, backend, database, and scanner components.

It is intended as a practical orientation document for contributors. It focuses on the architecture that is actually implemented now, rather than older design intent.

## System Shape

Open Port Monitor is split into three main runtime parts plus the database:

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
- React Router
- TanStack Query

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
| `/hosts/:hostId` | host detail |
| `/alerts` | alert review queue |
| `/alerts/:id` | alert detail |
| `/port-rules` | unified alert rules page |
| `/trends` | historical charts |
| `/users` | admin-only user management |

The frontend is not just a thin CRUD shell. It also contains a fair amount of workflow logic around alert review, filtering, scanner administration, host detail views, and rule management, with TanStack Query acting as the main synchronization layer with the backend.

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
| `/api/auth` | user auth |
| `/api/alerts` | alert review, comments, exports |
| `/api/global-ports` | deduplicated global open ports |
| `/api/global-settings` | shared security defaults |
| `/api/hosts` | host overview and host actions |
| `/api/metadata` | scanner type and alert type metadata |
| `/api/networks` | network CRUD and scan triggers |
| `/api/port-rules` | unified alert rules for port and SSH sources |
| `/api/ports` | port-oriented views |
| `/api/scanner` | scanner-to-backend protocol |
| `/api/scanners` | scanner CRUD and key management |
| `/api/scans` | scan list/detail/logs |
| `/api/ssh` | SSH findings and reporting |
| `/api/trends` | trend aggregates |
| `/api/users` | user CRUD |
| `/api/version` | version metadata |

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
- run `masscan`, `nmap`, and `ssh-audit`
- stream logs and progress
- submit results for persistence and alert generation

This design keeps scanners stateless enough to deploy near the networks they observe. A scanner does not need the full business context of the application; it only needs enough context to execute a job safely and report back.

## Data Model

The most important active tables are:

| Table | Purpose |
|-------|---------|
| `users` | local user accounts |
| `scanners` | registered scanner agents and API key hashes |
| `networks` | scan targets and policy config |
| `scans` | scan executions, progress, errors, single-host target support |
| `open_ports` | per-scan open-port records |
| `global_open_ports` | cross-scan deduplicated open ports |
| `hosts` | discovered hosts and host-level metadata |
| `alerts` | generated alerts |
| `alert_comments` | discussion and review notes |
| `alert_rules` | unified accepted/critical rules across `port` and `ssh` sources |
| `ssh_scan_results` | SSH probe results |
| `host_discovery_scans` | discovery-job tracking |
| `scan_logs` | streamed scanner logs |
| `global_settings` | shared SSH/global settings |

If you are new to the schema, the easiest way to think about it is as four connected domains:

1. inventory: `networks`, `hosts`, `global_open_ports`
2. execution history: `scans`, `scan_logs`, `host_discovery_scans`
3. findings: `open_ports`, `ssh_scan_results`, `alerts`
4. policy and collaboration: `alert_rules`, `alert_comments`, assignments, user accounts

## Notable Model Changes Versus Older Docs

These are the areas that most often drift in stale documentation:

- active alert-rule management is centered on `alert_rules`, exposed via `/api/port-rules`
- alerts carry a `source` field, not just a type
- alerts support `severity_override`
- scans support `target_ip` for single-host rescans
- networks include `scanner_type`, `scan_protocol`, `scan_timeout`, `port_timeout`, and `host_discovery_enabled`
- SSH findings are persisted in `ssh_scan_results`

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

- port findings
- SSH security findings

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
| `frontend/src/pages/` | route pages |
| `frontend/src/components/` | reusable UI |
| `frontend/src/lib/` | API helpers and utilities |
| `frontend/src/context/` | auth and theme state |
| `frontend/src/types/` | shared TypeScript types |

### Scanner

| Path | Purpose |
|------|---------|
| `scanner/src/main.py` | startup and poll loop |
| `scanner/src/client.py` | API client |
| `scanner/src/orchestration.py` | scan workflow |
| `scanner/src/discovery.py` | host discovery |
| `scanner/src/ssh_probe.py` | SSH probing |
| `scanner/src/scanners/` | scanner backends |

## Related Docs

- [Development setup](setup.md)
- [Scanner architecture](../scanner/architecture.md)
- [Alert states](../alert-states.md)
