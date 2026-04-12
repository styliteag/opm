# Hostname Cache & Enrichment

How the scanner resolves hostnames (vhosts) for target IPs and how Nuclei uses them for SNI fan-out.

## Architecture Overview

```
Host Discovery Job
  └─ enrich_host_results()          ← external API calls (HT, RapidDNS, crt.sh, ...)
       └─ POST /api/scanner/hostname-results
            └─ hostname_lookup_cache (DB)

Manual "Refresh" click (UI)
  └─ hostname_lookup_queue (DB)
       └─ Scanner poll loop drains queue
            └─ HackerTarget → RapidDNS chain
                 └─ POST /api/scanner/hostname-results
                      └─ hostname_lookup_cache (DB)

Nuclei Scan
  └─ GET /api/scanner/hostnames?ips=...   ← read-only, no external calls
       └─ hostname_lookup_cache (DB)
            └─ build_targets() → http://vhost:port / https://vhost:port
```

## Three Lookup Triggers

### 1. Host Discovery (automatic, inline)

During host discovery jobs, `enrich_host_results()` (`scanner/src/hostname_enrichment.py:696`) runs the full enrichment chain on all pingable public IPs without hostnames:

1. **nmap reverse DNS** (from scan output)
2. **SSL Certificate** CN/SAN extraction
3. **Google DNS** PTR lookup
4. **ip-api.com** reverse lookup
5. **HackerTarget** reverse IP API
6. **RapidDNS** HTML scrape fallback
7. **crt.sh** Certificate Transparency logs

Each source is tried only for IPs not yet resolved by a higher-priority source. Results from HackerTarget, RapidDNS, and crt.sh are posted back to the backend to populate the cache and increment budget counters.

### 2. Manual Queue (on-demand)

When a user clicks "Refresh" on a host detail page:

1. Backend enqueues entry in `hostname_lookup_queue` (migration 016)
2. Scanner drains queue every poll cycle (~60s) in `main.py:237`
3. Runs HackerTarget → RapidDNS chain per IP
4. Posts results → backend upserts cache, marks job completed/failed

### 3. Nuclei Scan (read-only)

Nuclei does **not** trigger external lookups. When `nuclei_sni_enabled=True`:

1. `GET /api/scanner/hostnames?ips=IP1,IP2,...` reads from cache only
2. IPs with cached hostnames → SNI fan-out targets (`http://vhost:port`, `https://vhost:port`)
3. IPs without cache entry → fallback to bare `IP:PORT` (no SNI)

## Cache Details

### Storage

Table: `hostname_lookup_cache` (one row per IP)

| Column | Description |
|--------|-------------|
| `ip` | Target IP (unique) |
| `hostnames_json` | List of resolved hostnames |
| `source` | Origin: `hackertarget`, `rapiddns`, `crt_sh`, `manual` |
| `status` | `success`, `no_results`, `failed` |
| `queried_at` | When lookup occurred |
| `expires_at` | TTL expiration |
| `error_message` | Diagnostic info (max 500 chars) |

### TTL Policy

| Outcome | TTL | Rationale |
|---------|-----|-----------|
| `success` | 30 days | Stable vhost lists |
| `no_results` | 7 days | Rarely changes |
| `failed` | 3 days | Transient failures retry sooner |
| `manual` | 56 days | Admin-curated, longer lived |

### Budget Tracking

Table: `hostname_lookup_budget` — per-source, per-UTC-day counters.

- **HackerTarget**: 50 req/day (anonymous) or 100/day (with API key), 0.6s rate limit
- **RapidDNS**: 100 req/day (conservative estimate), 0.6s rate limit
- Budget exhaustion → source skipped for rest of UTC day
- Rate-limit response from API → `used` pinned to `daily_limit`

## Nuclei Target Building

`build_targets()` in `scanner/src/scanners/nuclei.py`:

**Without hostnames** (SNI disabled or no cache hits):
```
IP:PORT  →  e.g. 10.0.0.1:443
```

**With hostnames** (SNI fan-out):
```
https://example.com:443
http://example.com:80
https://mail.example.com:443
```

- Max `SNI_MAX_VHOSTS_PER_IP` (default 50) hostnames per IP
- TLS ports (443, 8443, 9443, 2083, 2087, 8089) or `ssl` in service_guess → `https://`
- Everything else → `http://`

## Key Files

| Component | Path |
|-----------|------|
| Cache model | `backend/src/app/models/hostname_lookup.py` |
| Cache service | `backend/src/app/services/hostname_lookup.py` |
| Cache router | `backend/src/app/routers/hostname_lookup.py` |
| Scanner hostname router | `backend/src/app/routers/scanner.py` |
| External sources (HT, RapidDNS) | `scanner/src/hostname_sources.py` |
| Enrichment orchestrator | `scanner/src/hostname_enrichment.py` |
| Nuclei target builder | `scanner/src/scanners/nuclei.py` |
| Scanner main loop (queue drain) | `scanner/src/main.py` |
| Queue migration | `backend/src/migrations/versions/016_add_hostname_lookup_queue.py` |
