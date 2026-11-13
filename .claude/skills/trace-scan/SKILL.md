---
name: trace-scan
description: Debug the distributed scan pipeline — trace a scan or missing alert from network config through scheduler, job claim, scanner phases, result submission, and alert generation, with per-checkpoint commands. Use for "scan stuck", "no results", "no alert fired", "scanner does nothing", GVM/nuclei issues.
---

# Trace Scan

A scan crosses four processes (backend scheduler → DB → scanner agent → backend result/alert services). Bugs hide at the handoffs. Locate the failing checkpoint FIRST, then debug only that layer — do not read scanner code when the scan was never created.

## Setup

```bash
docker ps --format '{{.Names}}\t{{.Status}}'        # opm-db, opm-backend, opm-frontend, opm-scanner all up?
alias DB='docker exec -i opm-db mariadb -uopm -popmpassword opm -t -e'
```

API access when needed:
```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s localhost:8000/api/scans -H "Authorization: Bearer $TOKEN"
```

Log tails: `just dev-logs-backend`, `just dev-logs-scanner` (or `docker compose -f compose-dev.yml logs --tail=200 backend scanner`).

**Remember:** the scanner does NOT hot-reload. If you changed scanner code during debugging: `docker compose -f compose-dev.yml restart scanner`.

## The pipeline and its checkpoints

```
[1] scan row created (planned)      ← user click / APScheduler (every minute)
[2] scanner polls GET /api/scanner/jobs
[3] scanner claims POST /api/scanner/jobs/{network_id}/claim   → scan running
[4] phases run: host_discovery → port_scan → ssh_probe → vulnerability (nse|nuclei)
[5] results POST /api/scanner/results (+ vulnerability-results, nse results)
[6] backend stores ports/hosts, generates alerts               → scan completed
```

Find where it stops:

```bash
DB "SELECT id, network_id, status, trigger_type, error_message, created_at, started_at, completed_at
    FROM scans ORDER BY id DESC LIMIT 10;"
DB "SELECT source, level, message FROM scan_logs WHERE scan_id=<ID> ORDER BY id DESC LIMIT 40;"
```

## Checkpoint 1 — scan never created (scheduled scans)

- Scheduler runs inside the backend every minute; it SKIPS networks that already have a planned/running scan. Check: `DB "SELECT id,status FROM scans WHERE network_id=<N> AND status IN ('planned','running');"` — a stuck old scan blocks new ones. A stuck row may be cancelled via the UI or `PUT /api/scans/{id}/cancel`.
- Cron semantics: `SCHEDULE_TIMEZONE` env if set, else server-local time. Verify the network's `scan_schedule` value and next-fire expectation.
- Backend logs: `just dev-logs-backend | grep -i sched`.

## Checkpoint 2 — scan stuck in `planned` (nobody claims it)

Scanner side, in order:
1. Scanner alive + authenticated? `just dev-logs-scanner` — look for auth errors (401 = wrong/revoked API key), connection errors (`BACKEND_URL` wrong).
2. Kind mismatch: a `greenbone` network's job is only claimed by a scanner whose kind is `gvm`/`unified`; standard jobs need `standard`/`unified`. Check `DB "SELECT id,name,kind,last_seen_at FROM scanners;"` and the network's `scanner_type`.
3. Poll interval is `POLL_INTERVAL` (default 60 s) — wait one full cycle before concluding it's broken.
4. Claim returns 404/409 = another scanner won the race (fine, check other scanners' logs).

## Checkpoint 3/4 — scan `running` but never finishes

- `scan_logs` (query above) shows which phase is active. Phases run sequentially; cancellation is checked between phases and every ~5 s inside subprocess phases.
- Subprocess hangs are bounded by `ProcessTimeoutWatcher` (warn at 90 %, terminate, kill after 5 s). masscan timeout ⇒ scan fails with `TimeoutError`; nuclei timeout ⇒ `timed_out=True`, empty results, scan still completes — an "empty but completed" scan is nuclei-timeout-shaped.
- IPv6 targets: preflight TCP-connect to public DNS on port 53; no v6 connectivity ⇒ fast `RuntimeError`. Look for it in scan_logs.
- Masscan needs `NET_RAW`+`NET_ADMIN` (present in compose-dev). Zero results on a network that certainly has open ports ⇒ check masscan stderr in scanner logs and the network's `rate`/`port_spec` (exclusions are `!`-prefixed).
- GVM: task runs inside gvmd, polled every 30 s. `docker compose -f compose-gvm.yml logs -f gvmd`. First boot syncs feeds for a long time — `Interrupted at 0 %` or missing config usually means feeds/config not ready. Config/port-list resolution: library → scanner mirror → fail fast; check `gvm_scanner_metadata` snapshots and that names (never UUIDs) match.

## Checkpoint 5 — results submitted but rejected

- Backend accepts results for RUNNING or CANCELLED scans. A scan flipped to `failed`/`completed` earlier rejects late submissions — look for 4xx in scanner logs at submit time and matching backend log lines.
- Greenbone ordering invariant: vulnerabilities are submitted BEFORE open_ports (open_ports completes the scan; the vuln endpoint requires RUNNING). A code change that reorders this loses all GVM findings.
- Large vuln batches use a 120 s client timeout; `DataError` in backend logs = a field exceeding column width (the `oid` column is VARCHAR(255) since migration 011 — check any new long fields).

## Checkpoint 6 — scan completed but no alert / wrong severity

Alert generation is backend-side, after result processing. Check in this order:

1. **Was the finding stored at all?**
   `DB "SELECT ip, port, oid, source, severity FROM vulnerabilities WHERE scan_id=<ID> LIMIT 20;"`
   `DB "SELECT ip, port, protocol FROM open_ports WHERE scan_id=<ID> LIMIT 20;"`
2. **Dedup:** alerts dedupe on `(alert_type, ip, port)` while not dismissed — an existing open alert suppresses a new one. `DB "SELECT id,alert_type,ip,port,dismissed,severity FROM alerts WHERE ip='<IP>' ORDER BY id DESC LIMIT 10;"`
3. **Accept rules:** an accepted port rule (network `port_rules` or `global_port_rules`, `rule_type='accepted'`) suppresses future alerts by design. "Accepted" is computed, not stored on the alert.
4. **Severity threshold:** GVM/nuclei findings below the network's threshold (`gvm_alert_severity` / `nuclei_severity`, default high) are stored but never alert. Resolution order: network severity rule → global severity rule → native severity (`severity_rules` table; nuclei keys are composite `template_id:matcher_name`). NSE additionally requires a CVE or `VULNERABLE` marker unless a severity rule exists.
5. **Cancelled scans store partial results but alert generation only runs for completed scans.**
6. **Email:** alert stored but no mail ⇒ check network `alert_config.email_recipients`, `ALERT_EMAIL_RECIPIENTS` env, SMTP settings, and backend logs from `email_alerts`.

Relevant services when code-reading is needed: `alert_generation.py`, `alert_generators.py`, `vulnerability_results.py`, `nse_results.py`, `ssh_alert_generation.py`, `severity_rules.py` (all under `backend/src/app/services/`).

## Cross-cutting tools

- Knowledge graph: `query_graph` with `callers_of`/`callees_of` on the suspect function; `get_flow` for the execution path — cheaper than reading whole services.
- Reproduce fast: trigger a manual scan on a tiny network (single IP, small port spec) via the UI or `POST /api/networks/{id}/scans`.
- Scanner logs are batched (~5 s flush) — "missing" log lines may just be a flush behind; failed submits are re-queued, not lost.

## Report format

State: the failing checkpoint (1–6), the evidence (query/log line), the mechanism, then the fix or next step. If the fix touches code, follow feature-slice/ship rules (regression test + CHANGELOG `Fixed` entry naming the mechanism).
