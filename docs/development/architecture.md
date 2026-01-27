# Architecture Overview

This document describes the overall system architecture of Open Port Monitor, including the three-tier design, database schema, scan lifecycle, and alert generation logic.

## Three-Tier Architecture

Open Port Monitor follows a classic three-tier architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + TypeScript)                │
│                         Port 5173 (dev)                          │
│  • Single Page Application                                       │
│  • TanStack Query for data fetching                              │
│  • React Router for navigation                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP REST API
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI + Python)                   │
│                          Port 8000                               │
│  • REST API endpoints                                            │
│  • Business logic services                                       │
│  • SQLAlchemy ORM                                                │
│  • APScheduler for scheduled scans                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ SQLAlchemy Async
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (MySQL)                             │
│                          Port 3306                               │
│  • 14 main tables                                                │
│  • Alembic migrations                                            │
└─────────────────────────────────────────────────────────────────┘

        ┌───────────────────────────────────────────────────────┐
        │              SCANNER AGENTS (Python)                   │
        │  • Distributed port scanning agents                    │
        │  • Masscan for fast port discovery                     │
        │  • Nmap for service detection                          │
        │  • Poll backend for jobs                               │
        └───────────────────────────────────────────────────────┘
```

### Frontend

**Technology**: React 18, TypeScript, Vite, TanStack Query, React Router

**Key Directories**:
- `frontend/src/pages/` - Page components (Networks, Scans, Alerts, etc.)
- `frontend/src/components/` - Reusable UI components
- `frontend/src/lib/api.ts` - API client for backend communication
- `frontend/src/context/` - Auth and Theme context providers

**Main Routes**:
| Path | Purpose |
|------|---------|
| `/` | Dashboard with scan overview |
| `/networks` | Network management |
| `/scans` | Scan history and results |
| `/alerts` | Alert management |
| `/hosts` | Discovered hosts |
| `/ports` | Global open ports |
| `/policy` | Port rules configuration |
| `/users` | User management (admin) |
| `/trends` | Historical analytics |

### Backend

**Technology**: FastAPI, Python 3.11+, SQLAlchemy 2.0 (async), Pydantic v2

**Key Directories**:
- `backend/src/app/routers/` - API endpoint definitions
- `backend/src/app/services/` - Business logic layer
- `backend/src/app/models/` - SQLAlchemy ORM models
- `backend/src/app/schemas/` - Pydantic request/response schemas
- `backend/src/app/core/` - Configuration and database setup

**API Routes** (registered in `main.py`):
| Prefix | Purpose |
|--------|---------|
| `/api/auth` | User authentication |
| `/api/scanner` | Scanner agent endpoints |
| `/api/networks` | Network CRUD |
| `/api/scans` | Scan management |
| `/api/alerts` | Alert management |
| `/api/hosts` | Host discovery |
| `/api/global-ports` | Global open ports |
| `/api/policy` | Port rules |
| `/api/users` | User management |
| `/api/trends` | Analytics |

### Scanner Agent

**Technology**: Python, Masscan, Nmap

**Key Files**:
- `scanner/src/main.py` - Main scanner loop and execution logic

**Workflow**:
1. Authenticate with backend using API key
2. Poll for pending scan jobs every 60 seconds
3. Claim jobs and execute port scans
4. Stream progress, logs, and results back to backend

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │  scanners   │       │  networks   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │◄──────│ scanner_id  │
│ email       │       │ name        │       │ id (PK)     │
│ password_   │       │ api_key_    │       │ name        │
│   hash      │       │   hash      │       │ cidr        │
│ role        │       │ last_seen_  │       │ port_spec   │
│ created_at  │       │   at        │       │ scan_       │
└──────┬──────┘       └──────┬──────┘       │   schedule  │
       │                     │              └──────┬──────┘
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              │             │              │
       ▼              ▼             ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   alerts    │  │   scans     │◄─│ port_rules  │
├─────────────┤  ├─────────────┤  ├─────────────┤
│ id (PK)     │  │ id (PK)     │  │ id (PK)     │
│ scan_id(FK) │──│ network_id  │  │ network_id  │
│ network_id  │  │ scanner_id  │  │ port        │
│ alert_type  │  │ status      │  │ rule_type   │
│ ip          │  │ started_at  │  └─────────────┘
│ port        │  │ completed_  │
│ acknowledged│  │   at        │
│ assigned_   │  │ trigger_    │
│   to_user_  │  │   type      │
│   id (FK)   │  └──────┬──────┘
└──────┬──────┘         │
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│   alert_    │  │ open_ports  │
│  comments   │  ├─────────────┤
├─────────────┤  │ id (PK)     │
│ id (PK)     │  │ scan_id(FK) │
│ alert_id    │  │ ip          │
│ user_id     │  │ port        │
│ comment     │  │ protocol    │
└─────────────┘  │ service_    │
                 │   guess     │
                 └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   hosts     │  │global_open_ │  │global_port_ │
├─────────────┤  │   ports     │  │   rules     │
│ id (PK)     │◄─├─────────────┤  ├─────────────┤
│ ip (UNIQUE) │  │ id (PK)     │  │ id (PK)     │
│ hostname    │  │ host_id(FK) │  │ port        │
│ is_pingable │  │ ip          │  │ rule_type   │
│ seen_by_    │  │ port        │  │ ip          │
│   networks  │  │ protocol    │  │ description │
└─────────────┘  │ first_seen_ │  └─────────────┘
                 │   at        │
                 └─────────────┘

┌─────────────┐  ┌─────────────┐
│ scan_logs   │  │host_discov- │
├─────────────┤  │  ery_scans  │
│ id (PK)     │  ├─────────────┤
│ scan_id(FK) │  │ id (PK)     │
│ timestamp   │  │ network_id  │
│ level       │  │ scanner_id  │
│ message     │  │ status      │
└─────────────┘  └─────────────┘
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles (admin/viewer) |
| `scanners` | Registered scanner agents |
| `networks` | Network configurations (CIDR, ports, schedule) |
| `scans` | Scan executions with status tracking |
| `open_ports` | Ports discovered in each scan |
| `global_open_ports` | Deduplicated ports across all scans |
| `hosts` | Discovered hosts from host discovery |
| `alerts` | Security alerts generated from scans |
| `alert_comments` | Comments on alerts for collaboration |
| `port_rules` | Network-specific port allow/block rules |
| `global_port_rules` | Global port allow/block rules |
| `scan_logs` | Execution logs from scanner agents |
| `host_discovery_scans` | Host discovery job tracking |

### Key Relationships

- **scans.network_id** → networks.id (many-to-one)
- **scans.scanner_id** → scanners.id (many-to-one)
- **open_ports.scan_id** → scans.id (many-to-one, CASCADE DELETE)
- **alerts.scan_id** → scans.id (many-to-one)
- **alerts.network_id** → networks.id (many-to-one)
- **alerts.global_open_port_id** → global_open_ports.id (many-to-one)
- **alert_comments.alert_id** → alerts.id (many-to-one, CASCADE DELETE)
- **port_rules.network_id** → networks.id (many-to-one)
- **global_open_ports.host_id** → hosts.id (many-to-one)

---

## Scan Lifecycle

Scans progress through a defined set of states from creation to completion.

### State Diagram

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌─────────┐    ┌─────────┐    ┌───────────┐              │
│ PLANNED │───▶│ RUNNING │───▶│ COMPLETED │              │
└─────────┘    └────┬────┘    └───────────┘              │
     │              │                                     │
     │              │         ┌───────────┐              │
     │              └────────▶│  FAILED   │              │
     │              │         └───────────┘              │
     │              │                                     │
     │              │         ┌───────────┐              │
     │              └────────▶│ CANCELLED │◀─────────────┘
     │                        └───────────┘
     │                              ▲
     └──────────────────────────────┘
```

### Status Definitions

| Status | Description |
|--------|-------------|
| **PLANNED** | Scan created, waiting for scanner to claim |
| **RUNNING** | Scanner claimed job, executing scan |
| **COMPLETED** | Scan finished successfully, results stored |
| **FAILED** | Scan encountered error during execution |
| **CANCELLED** | User cancelled scan (from PLANNED or RUNNING) |

### Trigger Types

| Trigger | Description |
|---------|-------------|
| **MANUAL** | User initiated via UI or API |
| **SCHEDULED** | Created by scheduler based on network's cron schedule |

### Lifecycle Flow

```
1. SCAN CREATION
   ├─ Manual: User clicks "Scan" in UI
   │   └─ POST /api/networks/{id}/scan
   │   └─ Creates Scan with status=PLANNED, trigger_type=MANUAL
   │
   └─ Scheduled: Scheduler evaluates cron expressions every minute
       └─ services/scheduler.py → evaluate_schedules()
       └─ Creates Scan with status=PLANNED, trigger_type=SCHEDULED

2. JOB POLLING (Scanner Agent)
   └─ Scanner polls GET /api/scanner/jobs every 60 seconds
   └─ Returns networks with PLANNED scans for this scanner

3. JOB CLAIMING
   └─ Scanner: POST /api/scanner/jobs/{network_id}/claim
   └─ Backend: Updates status=RUNNING, started_at=now
   └─ Returns scan_id to scanner

4. SCAN EXECUTION
   ├─ Phase 1: Masscan port discovery (0-75% progress)
   ├─ Phase 2: Nmap service detection (75-100% progress)
   ├─ Progress updates: POST /api/scanner/progress
   └─ Log streaming: POST /api/scanner/logs

5. CANCELLATION CHECK (during execution)
   └─ Scanner periodically checks: GET /api/scanner/scans/{id}/status
   └─ If status=CANCELLED: terminate execution gracefully

6. RESULT SUBMISSION
   └─ Scanner: POST /api/scanner/results
   └─ Payload includes: status (success/failure), open_ports[], error_message
   └─ Backend: Updates Scan status, stores OpenPort records, generates alerts

7. COMPLETION
   ├─ COMPLETED: Results stored, alerts generated
   ├─ FAILED: Error message stored, scan marked failed
   └─ CANCELLED: Partial results may be stored
```

---

## Alert Generation

Alerts are security notifications generated when open ports are detected. The system generates two types of alerts: network-scoped and global.

### Alert Types

| Type | Description |
|------|-------------|
| **NEW_PORT** | Previously unknown port discovered |
| **NOT_ALLOWED** | Port open but not in network's allow list |
| **BLOCKED** | Port matches network's block rule |

### Alert Severity

Severity is computed dynamically based on alert type and acknowledgment status:

| Condition | Severity |
|-----------|----------|
| Alert acknowledged | INFO |
| BLOCKED alert type | CRITICAL |
| NEW_PORT alert type | HIGH |
| NOT_ALLOWED alert type | MEDIUM |

### Resolution Status

| Status | Description |
|--------|-------------|
| **OPEN** | New alert, not yet addressed |
| **IN_PROGRESS** | Under investigation |
| **RESOLVED** | Issue remediated |

### Generation Flow

When a scan completes successfully, two alert generation functions are called:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCAN COMPLETED                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
┌─────────────────────┐           ┌─────────────────────┐
│  Network-Scoped     │           │  Global Alerts      │
│  Alerts             │           │                     │
│  (per network)      │           │  (cross-network)    │
└─────────────────────┘           └─────────────────────┘
```

#### Network-Scoped Alerts

Generated by `generate_alerts_for_scan()` in `services/alerts.py`:

```
For each open port (ip, port) discovered:
  1. Check global whitelist → Skip if whitelisted
  2. Check network's alert_config for enabled types
  3. Evaluate against port_rules:
     ├─ BLOCK rules: Generate BLOCKED alert
     ├─ ALLOW rules: Skip if port allowed
     └─ No allow rules: Generate NOT_ALLOWED if network has allow list
  4. Check if port is new to this network:
     └─ Compare against previous scans → Generate NEW_PORT
  5. Deduplicate against existing unacknowledged alerts
  6. Create Alert record with scan_id and network_id
```

#### Global Alerts

Generated by `generate_global_alerts_for_scan()` in `services/alerts.py`:

```
For each open port (ip, port, protocol) discovered:
  1. Upsert to global_open_ports table:
     ├─ If new: is_new=True, set first_seen_at
     └─ If exists: is_new=False, update last_seen_at
  2. Skip if NOT new globally
  3. Check global whitelist → Skip if whitelisted
  4. Deduplicate against existing unacknowledged global alerts
  5. Create Alert record with global_open_port_id link
```

### Duplicate Prevention

Alerts are deduplicated using composite keys:

- **Network alerts**: `(alert_type, ip, port)`
- **Global alerts**: `(ip, port, protocol)`

Only one unacknowledged alert exists for each key combination.

---

## Data Flow Example

This example traces a manual port scan from initiation to alert generation.

```
1. USER ACTION
   └─ Click "Scan Network" in UI
   └─ Frontend: POST /api/networks/1/scan

2. BACKEND CREATES SCAN
   └─ Create Scan record:
      { id: 123, network_id: 1, status: "planned", trigger_type: "manual" }

3. SCANNER POLLS FOR JOBS
   └─ GET /api/scanner/jobs
   └─ Response: [{ network_id: 1, cidr: "10.0.0.0/24", port_spec: "22,80,443" }]

4. SCANNER CLAIMS JOB
   └─ POST /api/scanner/jobs/1/claim
   └─ Backend: Update Scan #123 status="running", started_at=now
   └─ Response: { scan_id: 123 }

5. SCANNER EXECUTES
   └─ Run: masscan -p22,80,443 10.0.0.0/24 --rate 1000
   └─ Found: 10.0.0.5:22, 10.0.0.10:80
   └─ Run: nmap -sV -p22 10.0.0.5 -p80 10.0.0.10
   └─ Detected: SSH, HTTP

6. SCANNER REPORTS PROGRESS
   └─ POST /api/scanner/progress { scan_id: 123, progress_percent: 50 }
   └─ POST /api/scanner/logs [{ timestamp: "...", level: "info", message: "..." }]

7. SCANNER SUBMITS RESULTS
   └─ POST /api/scanner/results
   └─ Payload:
      {
        "scan_id": 123,
        "status": "success",
        "open_ports": [
          { "ip": "10.0.0.5", "port": 22, "protocol": "tcp", "service_guess": "SSH" },
          { "ip": "10.0.0.10", "port": 80, "protocol": "tcp", "service_guess": "HTTP" }
        ]
      }

8. BACKEND PROCESSES RESULTS
   └─ Update Scan #123: status="completed", completed_at=now
   └─ Create OpenPort records for each discovered port
   └─ Upsert global_open_ports

9. ALERT GENERATION
   └─ generate_alerts_for_scan(scan_id=123)
      └─ Port 22 not in allow list → Create NOT_ALLOWED alert
      └─ Port 80 is new → Create NEW_PORT alert
   └─ generate_global_alerts_for_scan(scan_id=123)
      └─ Port 22 is new globally → Create global NEW_PORT alert
      └─ Port 80 is new globally → Create global NEW_PORT alert

10. USER VIEWS ALERTS
    └─ GET /api/alerts
    └─ Frontend displays alerts for investigation
```

---

## Key File Locations

### Backend

| Path | Purpose |
|------|---------|
| `backend/src/app/main.py` | FastAPI application entry point |
| `backend/src/app/models/` | SQLAlchemy ORM models |
| `backend/src/app/routers/` | API endpoint definitions |
| `backend/src/app/services/` | Business logic |
| `backend/src/app/schemas/` | Pydantic schemas |
| `backend/src/app/core/config.py` | Environment configuration |
| `backend/src/app/core/database.py` | Database session management |
| `backend/src/migrations/` | Alembic migrations |

### Frontend

| Path | Purpose |
|------|---------|
| `frontend/src/main.tsx` | Application entry point |
| `frontend/src/App.tsx` | Root component with routing |
| `frontend/src/pages/` | Page components |
| `frontend/src/components/` | Reusable UI components |
| `frontend/src/lib/api.ts` | Backend API client |
| `frontend/src/context/` | React contexts (Auth, Theme) |

### Scanner

| Path | Purpose |
|------|---------|
| `scanner/src/main.py` | Scanner agent implementation |
| `scanner/Dockerfile` | Container build configuration |

---

## Related Documentation

- [Developer Setup Guide](./setup.md) - Getting started with development
- [Contributing Guidelines](./contributing.md) - Code standards and PR process
- [API Overview](../api/overview.md) - API patterns and authentication
- [Scanner Architecture](../scanner/architecture.md) - Scanner implementation details
