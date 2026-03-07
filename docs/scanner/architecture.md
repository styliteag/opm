# Scanner Architecture

This document reflects the current scanner implementation in `scanner/src/`.

The goal of this document is to explain how the scanner behaves at runtime, not just list modules. The scanner is small enough to understand end to end, but it has several phases and background threads that are easy to miss when reading only the entrypoint.

## Overview

The scanner is a long-running Python agent that:

1. loads local configuration
2. waits for the backend health endpoint
3. authenticates using a scanner API key
4. polls for both port-scan and host-discovery jobs
5. executes the requested work
6. streams logs and progress
7. submits results back to the backend

Two distinct job families run through the same process:

- port-scan jobs
- host-discovery jobs

Those paths share authentication and polling, but diverge once a job is claimed.

The main entry point is [`scanner/src/main.py`](../../scanner/src/main.py).

## Main Loop

The main loop does two independent polls each cycle:

- `GET /api/scanner/jobs` for port-scan jobs
- `GET /api/scanner/host-discovery-jobs` for host discovery jobs

If neither returns work, the process sleeps for `POLL_INTERVAL` seconds and repeats.

That means a single scanner container can service both full port scans and discovery-only workflows without needing separate worker types.

## Scanner Modules

| Path | Role |
|------|------|
| `scanner/src/main.py` | process startup and poll loop |
| `scanner/src/client.py` | backend HTTP client, auth, retries |
| `scanner/src/orchestration.py` | job claiming and scan orchestration |
| `scanner/src/scanners/masscan.py` | masscan-based port scan path |
| `scanner/src/scanners/nmap.py` | nmap-based scan path |
| `scanner/src/discovery.py` | host discovery and SSH target detection |
| `scanner/src/ssh_probe.py` | `ssh-audit` parsing and SSH security probing |
| `scanner/src/threading_utils.py` | log streaming, progress reporting, cancellation, timeout watchers |
| `scanner/src/utils.py` | config loading, validation, command formatting, IPv6 connectivity checks |

## Startup Sequence

At startup the scanner:

1. loads `BACKEND_URL`, `API_KEY`, `POLL_INTERVAL`, and `LOG_LEVEL`
2. checks that `masscan` and `nmap` are available
3. logs version information from `VERSION`
4. waits for backend `/health`
5. creates a `ScannerClient`
6. begins the poll loop

The explicit backend readiness wait is important in development and during coordinated container startups. It reduces noisy failures when the backend container is still booting or migrating.

## Authentication Flow

Authentication is a two-step model:

1. The scanner sends its API key to `POST /api/scanner/auth` using the `X-API-Key` header.
2. The backend returns a short-lived bearer token used for subsequent scanner endpoints.

Implementation notes:

- the client caches the bearer token
- it re-authenticates automatically before expiry
- auth requests are rate-limited by the backend

From an operational perspective, scanner authentication is therefore:

- long-lived trust anchored by the API key
- short-lived request authorization via scanner JWT

## Port-Scan Jobs

### Job Payload

A port-scan job includes:

- `network_id`
- `cidr`
- `port_spec`
- `scanner_type`
- `scan_timeout`
- `port_timeout`
- `scan_protocol`
- `is_ipv6`
- optional `target_ip`

If `target_ip` is present, the scanner treats it as a single-host rescan and forces the nmap path for better service detection.

That is an intentional quality-over-speed choice. For targeted rescans, the scanner prefers richer service data rather than the broadest possible packet rate.

### Claiming

For each polled job, the scanner claims work through:

- `POST /api/scanner/jobs/{network_id}/claim`

If the backend returns `404` or `409`, the scanner skips that job and continues.

This is normal under contention or when another scanner or worker already consumed the pending work.

## Scan Engines

### Registered scanner types

The backend metadata currently registers:

- `masscan`
- `nmap`

These values are validated by the backend and sent to the scanner in job payloads.

### Masscan path

Masscan is used for fast broad discovery.

Current behavior:

- validates and sanitizes CIDR and port spec before execution
- supports excluded ports such as `!88`
- supports `tcp`, `udp`, and `both`
- reports progress by parsing masscan output
- runs nmap service detection afterward on the discovered open ports

So "masscan mode" is not masscan-only. In practice it is a hybrid workflow:

1. masscan quickly finds candidate open ports
2. nmap enriches those candidates with service details

Progress model:

- masscan discovery: `0-75%`
- nmap service detection after masscan: `75-90%`
- SSH probing can use the last portion of progress when SSH targets exist

### Nmap path

Nmap is used either when a network is configured with `scanner_type = "nmap"` or when the job is a single-host rescan.

Current behavior:

- phase 1: port discovery
- phase 2: service detection
- supports `tcp`, `udp`, and `both`
- supports IPv6 via `-6`
- reports progress by parsing nmap status output

This path is slower but more straightforward. It is a better fit when the network is smaller or when the operator wants service detection fidelity to dominate scan speed.

## SSH Security Probing

After a port scan completes successfully and returns open ports, the scanner detects SSH services and probes them with `ssh-audit`.

SSH services are identified by:

- port `22`
- or `service_guess` containing `ssh`

The probing phase:

- runs in parallel using a thread pool
- defaults to concurrency `10`
- defaults to timeout `10` seconds per target
- captures auth methods, SSH version, ciphers, KEX, MACs, and host key types
- classifies weak ciphers, weak KEX, and weak MACs

This phase is logically separate from open-port detection. The port scan discovers that SSH is reachable; the SSH probe then determines whether the reachable service is configured securely.

These results are included in the scan result submission as `ssh_results`.

The backend uses those results to persist SSH state and generate SSH-source alerts.

## Host Discovery Jobs

Host discovery is handled separately from port scanning.

### Polling and claiming

- `GET /api/scanner/host-discovery-jobs`
- `POST /api/scanner/host-discovery-jobs/{scan_id}/claim`

### Discovery implementation

Host discovery uses nmap ping scanning:

- `-sn`
- `-PE`
- `--disable-arp-ping`
- `-R`
- optional `-6`

It returns hosts that responded and includes:

- IP address
- hostname from reverse DNS when available
- ping status
- MAC address and vendor when visible

If the backend provides `known_hostnames`, those are applied before external enrichment runs.

This avoids redundant hostname lookups for IPs the system already knows.

## Progress, Logs, Cancellation, Timeout

### Progress reporting

`ProgressReporter` runs in a background thread and posts:

- `POST /api/scanner/progress`

It only sends updates when the percent or message changed.

That keeps progress traffic low while still allowing the UI to feel live.

### Log streaming

`LogStreamer` drains buffered log records and posts them to:

- `POST /api/scanner/logs`

Failed log submissions are requeued instead of dropped.

So transient backend or network issues do not immediately erase the log trail for an in-flight scan.

### Cancellation

Long-running scan processes are watched by `ScanCancellationWatcher`, which polls:

- `GET /api/scanner/scans/{scan_id}/status`

If the backend marks the scan as `cancelled`, the watcher terminates the subprocess.

The scanner therefore treats cancellation as a control-plane signal from the backend, not as a purely local process concern.

### Timeout handling

- `ProcessTimeoutWatcher` is used for masscan-style subprocesses
- nmap paths enforce timeout budgets inline
- warnings are logged around 90% of the configured timeout

This split exists because the subprocess behavior is different enough that one timeout model does not cleanly fit every scan path.

## Result Submission

Port-scan results are submitted to:

- `POST /api/scanner/results`

Payload includes:

- `scan_id`
- `status`
- `open_ports`
- optional `ssh_results`
- optional `error_message`

Important current behavior on the backend:

- results are accepted only when the scan is in `running` or `cancelled`
- if the scan was already marked `cancelled`, the backend keeps the scan status as `cancelled` while still storing any submitted partial results
- alert generation only runs for successfully completed scans

That last point is important when reasoning about incident noise: partial or cancelled scans can still persist data, but they should not generate fresh alert churn as though they were clean completed runs.

## Retry Behavior

`ScannerClient` retries transient HTTP failures with backoff for cases such as:

- request/network errors
- `429`
- `5xx`

It does not retry terminal claim outcomes like `404` or `409`.

In other words, the scanner is resilient to transient transport errors, but it does not treat coordination outcomes as failures to be retried blindly.

## IPv6 Handling

Before IPv6 scans or IPv6 host discovery, the scanner checks connectivity by attempting TCP connections to well-known IPv6 DNS servers. If connectivity is missing, the job fails immediately with a clear error.

## Relationship To The Backend

The scanner is intentionally thin: it executes scans and submits raw findings. The backend remains responsible for:

- persisting scans, ports, hosts, and SSH results
- generating alerts and alert rules
- auto-triggering host-discovery jobs after the first successful network scan when host discovery is enabled
- scheduling cron-based scans

That separation keeps scanning logic deployable near the target network while leaving policy, history, alerting, and UI-facing aggregation centralized in the backend.

## Related Files

- [Scanner deployment](deployment.md)
- [Scanner troubleshooting](troubleshooting.md)
- [Scanner API reference](../api/scanner-api.md)
