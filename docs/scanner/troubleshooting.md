# Scanner Troubleshooting Guide

This guide covers the issues that match the current scanner implementation and current UI.

## Authentication Failures

### Symptoms

- scanner logs show `401 Unauthorized`
- the scanner never appears online on the **Scanners** page
- job polling keeps failing

### Checks

1. Verify the scanner record exists on the **Scanners** page.
2. Confirm the container has the correct `API_KEY`.
3. Confirm `BACKEND_URL` points to the backend, not the frontend.

### Facts From The Current Implementation

- scanner API keys are sent in the `X-API-Key` header to `POST /api/scanner/auth`
- successful auth returns a short-lived JWT with `expires_in`
- the scanner client re-authenticates automatically when the token expires
- auth is rate-limited to 10 attempts per minute per client IP

### Common Causes

#### Invalid API key

The backend returns `401 Invalid API key`.

Fix:

- regenerate the key from the **Scanners** page or `POST /api/scanners/{id}/regenerate-key`
- update the container environment
- restart the scanner container

#### Wrong backend URL

If `BACKEND_URL` points at the wrong host, reverse proxy path, or frontend service, auth will fail or never connect.

Verify from inside the container:

```bash
docker exec opm-scanner curl -sS http://backend:8000/health
```

Adjust the URL for your deployment if needed.

#### Rate limiting

The backend returns `429 Rate limit exceeded. Maximum 10 attempts per minute.`

Fix:

- stop the failing restart loop or bad key rotation
- wait one minute
- try again with the corrected configuration

## Backend Connectivity

### Symptoms

- repeated "Backend not reachable" warnings
- scanner never gets past startup
- scanner does not update `last_seen_at`

### What The Scanner Actually Does

Before entering the main loop, the scanner waits for `GET /health` to return `200 OK`. It retries with backoff and eventually exits if the backend never becomes reachable.

### Checks

```bash
docker exec opm-scanner curl -v "$BACKEND_URL/health"
docker logs opm-scanner
```

Confirm:

- DNS resolution works
- the backend port is reachable
- TLS termination or reverse proxy config is correct

## Scanner Shows Offline

The UI derives online/offline state from `last_seen_at`. The backend updates `last_seen_at` whenever the scanner polls for jobs, and the frontend treats a scanner as online when it was seen within roughly five minutes.

Checks:

```bash
docker logs opm-scanner
docker compose -f compose-dev.yml logs scanner
```

Look for a healthy cycle:

```text
Backend is ready
Authenticating scanner with backend
Found 0 pending port scan job(s)
```

If the scanner authenticates once and then disappears:

- check network reachability to the backend
- check whether the container is restarting
- check whether `POLL_INTERVAL` is set to an unexpectedly large value

## Permission Errors

### Symptoms

- scans fail immediately
- `masscan` reports raw socket errors
- nmap discovery or packet-based scans fail

### Required Capabilities

The scanner requires both:

- `NET_RAW`
- `NET_ADMIN`

Verify:

```bash
docker inspect opm-scanner | grep -A5 CapAdd
```

If they are missing, update your container or Compose configuration and recreate the container.

## Missing Dependencies

The scanner checks for `masscan` and `nmap` at startup and logs warnings if either is missing.

Verify inside the container:

```bash
docker exec opm-scanner which masscan
docker exec opm-scanner which nmap
docker exec opm-scanner which ssh-audit
```

If `ssh-audit` is missing, SSH probing will be impacted even if port scanning still works.

## Job Claim Conflicts

### Symptoms

- log messages mention status `404` or `409` while claiming jobs

### Meaning

- `404`: there is no matching pending job for that scanner anymore
- `409`: another worker already claimed a running job for that network

This is usually transient and not a scanner bug. The scanner skips that job and continues polling.

## Scan Timeouts

Each network has:

- `scan_timeout` in seconds
- `port_timeout` in milliseconds

Current behavior:

- `masscan` uses a watchdog thread that warns at 90% and terminates at 100%
- `nmap` splits timeout budget across phases
- SSH probing runs after open-port discovery and uses a separate per-probe timeout

If large scans fail by timeout:

- increase `scan_timeout`
- increase `port_timeout` on high-latency networks
- reduce CIDR size or port scope
- prefer `masscan` for broad discovery

## IPv6 Failures

Before IPv6 port scans or IPv6 host discovery, the scanner checks IPv6 connectivity using public IPv6 DNS targets. If the host has no usable IPv6 route, the job fails fast.

Verify host/container IPv6 connectivity before retrying.

## Host Discovery Issues

Host discovery jobs are separate from port-scan jobs and run through dedicated endpoints.

Facts from the current code:

- discovery uses `nmap -sn`
- reverse DNS is enabled with `-R`
- ARP ping is disabled
- hostname enrichment may query external services after discovery when no hostname is known locally

If host discovery returns fewer hosts than expected:

- confirm ICMP echo is allowed
- confirm the target range is reachable from the scanner host
- check whether local firewalls suppress ping responses
- remember that host discovery only returns hosts that responded

## Interpreting Logs

The scanner writes logs both to stdout and back to the backend during scans.

### Useful places to inspect

```bash
docker logs -f opm-scanner
docker compose -f compose-dev.yml logs -f scanner
```

In the UI:

1. Open **Scans**
2. Open a scan detail page
3. Review the stored log stream there

### Common patterns

#### Healthy startup

```text
Onyx Port Monitor Scanner vX.Y.Z starting...
Polling interval set to 60 seconds
Waiting for backend to be ready...
Backend is ready
Authenticating scanner with backend
```

#### Authentication problems

```text
Authenticating scanner with backend
401 Unauthorized
```

#### Cancellation

```text
Scan cancelled by user request
```

#### Timeout pressure

```text
Masscan scan approaching timeout (90% elapsed)
Masscan scan exceeded timeout (...)
```

## Development Environment Notes

In `compose-dev.yml`:

- container name is `opm-scanner`
- host-side env vars are `SCANNER_BACKEND_URL`, `SCANNER_API_KEY`, `SCANNER_POLL_INTERVAL`, `SCANNER_LOG_LEVEL`
- code changes in `scanner/src` are bind-mounted but do not auto-restart the process

After scanner code changes or API key changes:

```bash
docker compose -f compose-dev.yml restart scanner
```

## Quick Reference

| HTTP status | Meaning |
|-------------|---------|
| `401` | invalid API key or expired/invalid JWT |
| `404` | job or scan not found for this scanner |
| `409` | job already claimed or running |
| `429` | auth rate limit hit |
| `5xx` | backend-side failure; scanner retries transiently |

## When To Collect More Data

Capture these before escalating:

```bash
docker logs opm-scanner > scanner.log 2>&1
docker compose -f compose-dev.yml logs backend > backend.log 2>&1
```

Include:

- scanner name
- network CIDR
- scan ID
- whether the job was IPv4, IPv6, host discovery, or single-host rescan
