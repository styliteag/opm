# Hostname Lookup Cache — Scanner-Centric Refactor (Plan C)

**Status**: planned, not started
**Target version**: 2.3.0 (after 2.2.0 ships with minimal cleanup)
**Estimated work**: 3–4 hours including tests + live verification
**Context**: Commits 1–8 (shas `21c913d` → `9abedaa`) built the current
hostname lookup cache feature with the filler living in the **backend**.
During post-implementation review we decided the filler actually belongs
in the **scanner**, since the scanner is already the egress point for
every external API call in the system. This document captures the full
refactor plan so it can be picked up in a fresh session with no context.

## Motivation

The current architecture (2.2.0) has **two** components calling
HackerTarget independently:

1. `scanner/src/hostname_enrichment.py::enrich_hostnames_hackertarget`
   — fires during host-discovery phase, populates the single-value
   `hosts.hostname` column. Drops 99% of returned hostnames via
   `results[ip] = domains[0]`.

2. `backend/src/app/services/hostname_lookup_filler.py::
   run_hostname_cache_filler` — hourly APScheduler job, populates
   `hostname_lookup_cache.hostnames_json` with the full list.

Consequences of the split:

- **Double-burn of the 50 req/day HackerTarget limit**. Scanner eats
  ~20 slots during discovery, backend filler then hits 429 faster.
- **Two code paths to maintain** for the same provider.
- **Backend has to make outbound calls** to the public internet,
  which conflicts with stricter deployments where the backend is
  firewalled.
- **Timing is misaligned**: discovery enrichment is synchronous with
  scanning; cache fill is a separate hourly cadence that operators
  have to reason about independently.

The refactor consolidates **all** external hostname API calls into
the scanner, keeps the cache as backend storage, and exposes two
manual entry points from the UI: hand-edit (already exists from
Commit 8) and on-demand lookup trigger (new).

## Goals

1. **One network egress point** for hostname APIs: the scanner.
2. **Backend owns storage + manual edit + observability** — no
   outbound calls from the backend service itself.
3. **Automatic** enrichment happens during host discovery and as a
   side effect of regular scans.
4. **Manual lookup** can be triggered from the UI for a specific IP
   and runs the next time any scanner polls.
5. **Manual hand-edit** via the UI for a specific IP (unchanged
   from Commit 8).
6. **Budget coordination** across multiple scanners via
   backend-owned counter.
7. **`/hosts` table** in the frontend gets a cached-hostname display
   + a "+N vhosts" chip with click-to-expand.

## Target Architecture

```
┌────────────── SCANNER (any count ≥ 1) ────────────────┐
│                                                        │
│  hostname_enrichment.py (refactored)                   │
│  ├── nmap ssl-cert (local)                             │
│  ├── Google DNS PTR                                    │
│  ├── ip-api.com batch                                  │
│  ├── HackerTargetSource  ─┐   ← MOVED from backend     │
│  ├── RapidDnsSource      ─┤   ← MOVED from backend     │
│  └── crt.sh              ─┘                            │
│                                                        │
│  Runs during:                                          │
│  • Host-discovery phase (new hosts)                    │
│  • Pending queue poll (manual requests)                │
│                                                        │
│  Budget: pre-flight GET + post-fact increment via      │
│          backend API                                   │
│                                                        │
│  Posts results via:                                    │
│  POST /api/scanner/hostname-results                    │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌─────────────────── BACKEND ────────────────────────────┐
│                                                        │
│  hostname_lookup_cache        hostname_lookup_budget   │
│  (storage)                    (shared rate limits)     │
│                                                        │
│  hostname_lookup_queue                                 │
│  (manual on-demand lookups pending for scanner)        │
│                                                        │
│  Endpoints:                                            │
│  • POST /api/scanner/hostname-results (scanner write)  │
│  • GET  /api/scanner/hostname-budget  (scanner read)   │
│  • GET  /api/scanner/hostname-lookup-jobs              │
│  • POST /api/scanner/hostname-lookup-jobs/{id}/claim   │
│  • GET  /api/scanner/hostnames (nuclei SNI, existing)  │
│  • PUT  /api/admin/hostname-lookup/entries/{ip}        │
│  • DEL  /api/admin/hostname-lookup/entries/{ip}        │
│  • POST /api/hosts/{id}/hostname-lookup/refresh (NEW)  │
│  • GET  /api/hosts/{id}/hostnames (existing)           │
│  • GET  /api/admin/hostname-lookup/export (existing)   │
│  • POST /api/admin/hostname-lookup/import (existing)   │
│  • GET  /api/admin/hostname-lookup/status (existing,   │
│         but returns fewer fields — no filler state)    │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌─────────────────── FRONTEND ───────────────────────────┐
│                                                        │
│  /hosts table (enhanced)                               │
│  • Display name: first cached vhost else host.hostname │
│  • Chip "+N vhosts" with click-to-expand tooltip       │
│                                                        │
│  /hosts/{id} detail (enhanced)                         │
│  • HostKnownHostnames card (existing from Commit 8)    │
│  • Edit button → modal dialog (existing)               │
│  • NEW: "Refresh now" button → POST refresh endpoint,  │
│    toasts "queued, pick up on next scanner poll"       │
│                                                        │
│  /admin/hostname-lookup (simplified)                   │
│  • Stats cards (coverage, vhost total, budgets)        │
│  • Entries table with filter/search                    │
│  • Manual edit dialog per row (existing)               │
│  • REMOVED: "Run filler now" button (filler is gone)   │
│  • Export / Import buttons (existing)                  │
│  • Per-row "Refresh now" button (same endpoint)        │
└────────────────────────────────────────────────────────┘
```

## Schema Changes — Migration 016

**New table** `hostname_lookup_queue`:

```sql
CREATE TABLE hostname_lookup_queue (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    ip                    VARCHAR(45) NOT NULL,
    requested_by_user_id  INT NULL,
    requested_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at            DATETIME NULL,
    completed_at          DATETIME NULL,
    status                VARCHAR(16) NOT NULL DEFAULT 'pending',
        -- values: pending | claimed | completed | failed
    error_message         TEXT NULL,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status_requested (status, requested_at),
    INDEX idx_ip (ip)
);
```

Notes:
- Multiple pending rows for the same IP is fine (we de-dupe client-side
  when claiming). A UNIQUE constraint on `(ip, status='pending')`
  would need partial indexes which MariaDB < 10.5 doesn't support.
- `claimed_at` is set when a scanner calls `/claim`. Rows stuck in
  `claimed` state for > 1 hour are re-queued by a tiny sweep on the
  read endpoint (not a scheduled job).
- `completed` rows are kept for 7 days as an audit trail, then a
  DELETE runs on read (lazy cleanup).

**No changes** to `hostname_lookup_cache` or `hostname_lookup_budget`.

## Code Changes

### Backend — DELETE

- `backend/src/app/services/hostname_lookup_filler.py` — entire file
- `backend/tests/test_hostname_lookup_filler.py` — entire file
- In `backend/src/app/services/hostname_lookup.py`:
  - `HackerTargetSource` class (~80 LOC)
  - `RapidDnsSource` class (~90 LOC)
  - `_build_source_chain()` helper (moved to filler file anyway)
  - `lookup_with_cache` function (only used by tests now; can stay or
    be deleted — decision at refactor time)
  - Constants: `HACKERTARGET_*`, `RAPIDDNS_*`, `_FQDN_RE`, `_RAPIDDNS_TD_RE`
- In `backend/src/app/services/hostname_lookup_io.py`:
  - `_daily_limit_for()` — no longer needed in backend, but the
    `get_cache_status` function can take the limit as a parameter
    from the request or expose "unknown" for limits.
- In `backend/src/app/routers/hostname_lookup.py`:
  - `POST /run-filler` endpoint (filler is gone)
  - `trigger_hostname_cache_filler` handler
- In `backend/src/app/services/scheduler.py`:
  - `add_job` call for `run_hostname_cache_filler`
  - `from app.services.hostname_lookup_filler import ...` local import
- In `backend/src/app/core/config.py`:
  - `hostname_lookup_enabled` setting (moves to scanner config)
  - `hackertarget_api_key` setting (moves to scanner config)
  - `rapiddns_enabled` setting (moves to scanner config)
  - `rapiddns_daily_limit` setting (moves to scanner config)
  - `hostname_lookup_interval_minutes` setting (no longer needed;
    scanner tied to scan cadence)
- In `backend/tests/test_hostname_lookup_service.py`:
  - `TestHackerTargetParse` class (~8 tests)
  - `TestHackerTargetFetch` class (~4 tests)
  - `TestRapidDnsParse` class (~8 tests)
  - `TestLookupWithCache` class (if `lookup_with_cache` is deleted)

Target: net **delete ~900 LOC** from backend.

### Backend — KEEP

- `hostname_lookup_cache` table + model + schemas
- `hostname_lookup_budget` table + model
- Service primitives: `get_cached_hostnames`, `get_hostnames_for_ips`,
  `upsert_cache_row`, `get_cache_row_for_ip`,
  `update_cache_entry_manual`, `delete_cache_entry`,
  `consume_budget`, `pin_budget_exhausted`, `get_budget_used`
- Constants: TTL_SUCCESS_DAYS, TTL_NO_RESULTS_DAYS, TTL_FAILED_DAYS,
  MANUAL_EDIT_TTL_DAYS, MANUAL_SOURCE_NAME
- Endpoints unchanged:
  - `GET /api/scanner/hostnames?ips=...` (nuclei SNI fan-out)
  - `GET /api/hosts/{id}/hostnames` (host detail panel)
  - `PUT /api/admin/hostname-lookup/entries/{ip}` (manual edit)
  - `DELETE /api/admin/hostname-lookup/entries/{ip}`
  - `GET /api/admin/hostname-lookup/export`
  - `POST /api/admin/hostname-lookup/import`
  - `GET /api/admin/hostname-lookup/status` (simplified payload)

### Backend — NEW

1. **Queue model** `backend/src/app/models/hostname_lookup.py`:
   Add `HostnameLookupQueueEntry` class mapping to new table.

2. **Queue schemas** `backend/src/app/schemas/hostname_lookup.py`:
   - `HostnameLookupQueueEntry` for list/claim responses
   - `HostnameLookupQueueListResponse` wrapper

3. **Queue service** functions in
   `backend/src/app/services/hostname_lookup.py`:
   - `enqueue_hostname_lookup(db, ip, requested_by_user_id) -> queue_entry`
   - `get_pending_queue_entries(db, limit=10) -> list[queue_entry]`
     (also re-queues claimed-but-stuck rows older than 1h)
   - `claim_queue_entry(db, queue_id) -> queue_entry | None`
     (atomic update via `UPDATE ... WHERE status='pending'`)
   - `mark_queue_entry_completed(db, queue_id, error=None)`
   - `cleanup_old_queue_entries(db)` (lazy, deletes completed > 7d,
     called from `get_pending_queue_entries`)

4. **Scanner-facing endpoints** in
   `backend/src/app/routers/scanner.py`:
   - `GET /api/scanner/hostname-budget` → returns per-source
     remaining counts: `{hackertarget: 30, rapiddns: 95}`
   - `POST /api/scanner/hostname-results` → bulk write. Body:
     ```json
     {
       "results": [
         {"ip": "1.2.3.4", "source": "hackertarget",
          "status": "success", "hostnames": ["a.example", "b.example"]},
         ...
       ]
     }
     ```
     For each result: validates source, atomically increments
     budget (rejects with 429 if over), calls `upsert_cache_row`,
     syncs `hosts.hostname` to first entry if host exists.
   - `GET /api/scanner/hostname-lookup-jobs?limit=10` → returns
     pending queue entries, marks them as `claimed`
   - `POST /api/scanner/hostname-lookup-jobs/{id}/complete` → body
     `{status: "completed"|"failed", error?: str}` — scanner calls
     this after posting results for the queued IP

5. **User-facing endpoint** in
   `backend/src/app/routers/hosts.py` (or a new router):
   - `POST /api/hosts/{host_id}/hostname-lookup/refresh` → enqueues
     a manual lookup job for the host's IP, returns 202 + queue id

6. **Admin endpoint** in
   `backend/src/app/routers/hostname_lookup.py`:
   - `POST /api/admin/hostname-lookup/entries/{ip}/refresh` →
     enqueues a manual lookup for an arbitrary IP (admin-only)

### Scanner — DELETE

Nothing entirely — the existing `hostname_enrichment.py` module stays
but gets refactored in place. The scanner still has these functions:
`enrich_hostnames_ssl_cert`, `enrich_hostnames_google_dns`,
`enrich_hostnames_ip_api`, `enrich_hostnames_hackertarget`,
`enrich_hostnames_crt_sh`, `enrich_host_results`.

### Scanner — CHANGE

1. **Multi-value return**:
   `enrich_hostnames_hackertarget` + the other four → signature
   changes from `dict[str, str]` to `dict[str, list[str]]`. The
   functions keep **all** results per IP instead of `[0]`.
   `enrich_host_results` changes to update `HostResult.hostname`
   (still single-value for display) with the first entry of the
   merged list.

2. **Budget-aware HackerTarget call**:
   Before calling HackerTarget, scanner fetches
   `GET /api/scanner/hostname-budget`. If `hackertarget` budget is
   0, skip the HT call entirely. Same for rapiddns.

3. **New `RapidDnsSource`** function:
   `enrich_hostnames_rapiddns(ips, logger)` — same shape as the
   other five, HTML parser for rapiddns.io `/sameip/`.

4. **Post results to backend cache**:
   New helper `post_hostname_results_to_backend(client, results)`
   in `hostname_enrichment.py` or in `scanner/src/client.py`. Posts
   `{results: [...]}` to `/api/scanner/hostname-results` after
   enrichment completes. **Only posts what HT/rapiddns/crt.sh
   actually returned** — ssl-cert / PTR / ip-api results are NOT
   posted (they're host display names, not vhost lists, and don't
   belong in the SNI fan-out cache).

5. **Queue poller**:
   New function `process_hostname_lookup_queue(client, logger)`
   called from `main.py` alongside the existing scan-job poll loop.
   Each poll cycle:
   - `GET /api/scanner/hostname-lookup-jobs?limit=10`
   - For each claimed job: run the HT/rapiddns chain against the
     single IP, post results, call `/complete`
   - Respects budget just like discovery-time enrichment
   - Fire-and-forget: errors logged, job marked `failed`

6. **Scanner client additions** in `scanner/src/client.py`:
   - `get_hostname_budget() -> dict[str, int]`
   - `post_hostname_results(results: list[dict])`
   - `get_hostname_lookup_jobs(limit: int) -> list[QueueEntry]`
   - `complete_hostname_lookup_job(job_id, status, error=None)`

7. **Scanner config** in `scanner/pyproject.toml` or env vars:
   - `HACKERTARGET_API_KEY` (if set, use 100/day limit)
   - `RAPIDDNS_ENABLED` (default true)

### Frontend — CHANGE

1. **Hooks** in
   `frontend/src/features/hostname-lookup/hooks/useHostnameLookup.ts`:
   - Remove `useRunHostnameCacheFiller` (endpoint gone)
   - Add `useRefreshHostHostnames(hostId)` → POST refresh endpoint
   - Add `useRefreshCacheEntry(ip)` → admin version (posts to
     `/api/admin/hostname-lookup/entries/{ip}/refresh`)

2. **`/admin/hostname-lookup` page**:
   - Remove "Run filler now" button
   - Add "Refresh" button per row in the entries table (three icons
     now: Pencil, RefreshCw, Trash2)
   - Status cards: remove "Filler schedule" card, replace with
     "Pending lookups" (count of queue rows)
   - Live poll interval unchanged (15s)

3. **`/hosts` table**:
   - Query TanStack hook gets a new field or separate query for
     cached-hostname counts per listed host. Options:
     - (a) Backend `/api/hosts` response includes
       `cached_hostname_count: int` + `cached_display_hostname: str`
       per row (JOIN with hostname_lookup_cache at query time)
     - (b) Separate batch query
       `GET /api/hosts/hostnames-summary?ids=1,2,3` returning
       `{1: {count: 35, first: "example.com"}, ...}`
   - Recommend option (a) for simplicity (one request).
   - Display: `host.cached_display_hostname or host.hostname` as the
     hostname column; add a small `+N` chip next to it when
     `cached_hostname_count > 1`, click shows tooltip with all
     hostnames (fetched via `useHostCachedHostnames(hostId)` on
     tooltip open)

4. **`/hosts/{id}` detail**:
   - `HostKnownHostnames` component gets a "Refresh" button next
     to the expand chevron
   - Clicking triggers `useRefreshHostHostnames(id)`, toasts
     "queued — results appear on next scanner poll (~5 s)"
   - After 10 s delay, invalidates `host-hostnames` query so the
     panel refreshes with new data

## Migration / Deployment Sequence

**Critical**: the scanner and backend must both be upgraded for
this to work. The old scanner posts nothing, the new backend
endpoint would sit idle; or the old backend has the filler running,
which would double-work with the new scanner.

Sequence:

1. Ship backend with **both** the filler running AND the new
   scanner-facing endpoints in place. Deploy.
2. Ship scanner that uses the new endpoints AND still has the
   old `enrich_hostnames_hackertarget` code path disabled but
   present. Deploy.
3. Verify cache fills from scanner side. Check budget counter
   increments only from scanner.
4. Disable the backend filler via `HOSTNAME_LOOKUP_ENABLED=false`
   env var (assuming we keep the flag during transition).
5. Once verified stable for 1–2 days, delete the filler code and
   ship 2.3.1 (or keep as 2.3.0 if landed atomically).

For a single-instance dev setup this is all one `release.sh`
invocation. Production with multiple scanners needs a rolling
upgrade with the env var kill-switch as a safety net.

## Test Plan

**Backend**:
- Queue service: enqueue → pending row exists, get_pending returns
  it, claim → row transitions to claimed, complete → row
  transitions to completed
- Claim race: two simultaneous claim calls → one gets the row,
  other gets None
- Stuck-claim sweep: claimed row older than 1h → re-queued on next
  read
- Lazy cleanup: completed row older than 7d → deleted on next read
- New scanner endpoints: hostname-budget (auth, happy path),
  hostname-results (write, budget exhaustion, host.hostname sync),
  hostname-lookup-jobs (returns pending, marks as claimed)
- User refresh endpoint: enqueues row, 202 response, duplicate IP
  → still enqueued (or de-duped, decision point)
- Updated status endpoint: no more "filler schedule" field, new
  "pending queue count" field

**Scanner**:
- Refactored enrichment: multi-value return preserves all results
- Budget-aware call: skips HT when budget is 0
- RapidDnsSource: parses sample HTML, handles 429, Cloudflare
  challenge
- Queue poller: picks up pending jobs, processes, posts, completes
- POST results: retries on transient failure

**Frontend**:
- `useRefreshHostHostnames` hook: mutation fires, invalidates
  query after delay
- `/hosts` table: shows cached hostname when present, falls back
  to `host.hostname`; chip+tooltip for multi-vhost rows
- Admin UI: "Run filler now" button gone; per-row Refresh button
  works

**End-to-end** (manual on dev stack):
1. Enqueue a manual lookup via frontend
2. Observe scanner poll picks it up within 5 s
3. Observe cache row appears with correct source
4. Observe `/hosts` table updates display hostname
5. Verify budget counter increments
6. Trigger a full network scan, observe discovery-phase enrichment
   also posts results
7. Verify double-burn is gone (only one source of budget
   consumption per IP)

## Rollback Plan

If the refactor causes production issues after deploy:

1. **Re-enable backend filler** via env var
   `HOSTNAME_LOOKUP_ENABLED=true` — the filler code still exists
   in the 2.3.0 deploy during the transition window.
2. **Disable scanner posting** by setting an env var or feature
   flag in scanner config. Scanner reverts to old single-value
   behavior for `hosts.hostname` and stops posting to cache.
3. **Drop queue table** as a last resort via migration
   downgrade — but this loses pending manual requests.

The 2.2.0 codebase stays available as a rollback target.

## Open Questions

1. **Should `lookup_with_cache` (the orchestrator) survive?** It's
   only used by tests in the current code. Could delete or keep
   as a documented helper. Decision at refactor time.
2. **Queue cleanup timing**: 7 days of completed rows is arbitrary.
   May want to keep forever for audit / investigation. Or shorter
   (1 day) to keep the table small.
3. **Budget coordination during scanner poll races**: two scanners
   both see `30 remaining`, both consume 20, total 40 is fine; but
   both consume 25 → 50 over → the 51st call fails at HackerTarget
   with a real 429 → handled gracefully already (pin budget, skip).
   Verify this works without new code.
4. **Should `hosts.hostname` be auto-synced on cache write, or
   computed at response time?** Denormalized is simpler and already
   matches the existing column. Recommendation: sync on write.
5. **Frontend `/hosts` table**: option (a) JOIN in backend
   response, or (b) separate batch endpoint. Simpler: (a).
6. **Rate limit on manual refresh trigger**: a malicious or
   frustrated admin spamming the button could enqueue 1000 jobs and
   burn budget instantly. Mitigation: per-IP deduplication (only
   one pending entry per IP), and/or per-user rate limit on the
   enqueue endpoint.
7. **Should `/admin/hostname-lookup` stay at all?** The per-host
   edit/refresh on `/hosts/{id}` arguably replaces most of its
   value. Keep as an observability dashboard (read-only stats +
   read-only entries table + export/import)? Or delete entirely?
   Recommendation: keep, simplified — drop "Run filler now"
   button, add "Pending queue count" stat.

## Commit Breakdown

A tentative commit-per-step split so the refactor is reviewable:

- **Commit 1** — Migration 016: `hostname_lookup_queue` table
- **Commit 2** — Backend queue service + schemas + router endpoints
- **Commit 3** — Backend `POST /api/scanner/hostname-results` +
  `GET /api/scanner/hostname-budget` endpoints
- **Commit 4** — Scanner: move `HackerTargetSource` + `RapidDnsSource`
  classes from backend to scanner (copy first, delete in later
  commit)
- **Commit 5** — Scanner: `hostname_enrichment.py` refactor to
  multi-value + backend posting + budget awareness
- **Commit 6** — Scanner: queue poller
  (`process_hostname_lookup_queue`) wired into `main.py`
- **Commit 7** — Frontend: `/hosts` table enhancements (display
  hostname from cache, +N chip)
- **Commit 8** — Frontend: `/hosts/{id}` detail — Refresh button
  + hook
- **Commit 9** — Frontend: `/admin/hostname-lookup` simplification
  — remove filler button, add per-row Refresh, update stat cards
- **Commit 10** — Backend cleanup: delete
  `hostname_lookup_filler.py`, scheduler wiring, backend
  `HackerTargetSource` / `RapidDnsSource`, related tests, settings
- **Commit 11** — Release `2.3.0` via `release.sh minor` + verify
  Docker images build

## Prerequisites Before Starting

In a fresh session, before touching code:

1. Read this plan document in full
2. Read the current state: `git log --oneline v2.1.4..HEAD` plus
   the CHANGELOG entries for 2.2.0 and the current `[Unreleased]`
3. Read these files (they contain 80% of the mental model):
   - `backend/src/app/services/hostname_lookup.py`
   - `backend/src/app/services/hostname_lookup_filler.py`
   - `backend/src/app/services/hostname_lookup_io.py`
   - `backend/src/app/routers/hostname_lookup.py`
   - `backend/src/app/models/hostname_lookup.py`
   - `scanner/src/hostname_enrichment.py`
   - `scanner/src/main.py` (scanner poll loop)
   - `frontend/src/features/hostname-lookup/hooks/useHostnameLookup.ts`
   - `frontend/src/routes/_authenticated/admin/hostname-lookup.tsx`
   - `frontend/src/features/hosts/components/HostKnownHostnames.tsx`
4. Verify the dev stack is running: backend, scanner, frontend,
   mariadb. Test the current `/admin/hostname-lookup` page works.
5. Confirm `CHANGELOG.md` `[Unreleased]` is empty (i.e. 2.2.0 has
   been released) before starting Commit 1. If 2.2.0 is NOT yet
   released, stop and release first so the refactor lands cleanly
   in 2.3.0.
