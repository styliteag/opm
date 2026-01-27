# Scanner Architecture

This document explains how the scanner agent works internally, including scan types, the hybrid scanning approach, IPv6 support, host discovery, and the job processing lifecycle.

## Overview

The scanner is a Python-based agent that runs independently from the backend. It polls the backend for scan jobs, executes them using masscan and/or nmap, and submits results back to the backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Scanner Agent                            │
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Job Poller  │───▶│ Scan Engine  │───▶│   Result     │       │
│  │             │    │              │    │  Submitter   │       │
│  └─────────────┘    └──────────────┘    └──────────────┘       │
│         │                  │                   │                │
│         │           ┌──────┴──────┐           │                │
│         │           ▼             ▼           │                │
│         │     ┌─────────┐   ┌─────────┐      │                │
│         │     │ masscan │   │  nmap   │      │                │
│         │     └─────────┘   └─────────┘      │                │
│         │                                     │                │
│         ▼                                     ▼                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │                  Background Threads                   │     │
│  │  • Progress Reporter (every 5s)                       │     │
│  │  • Log Streamer (every 5s)                           │     │
│  │  • Cancellation Watcher (every 5s)                   │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    Backend API   │
                    │                  │
                    │ • /scanner/jobs  │
                    │ • /scanner/results│
                    │ • /scanner/logs  │
                    │ • /scanner/progress│
                    └──────────────────┘
```

## Scan Types

The scanner supports two primary scan engines, selected by the `scanner_type` field in the job payload.

### Masscan

**Purpose**: High-speed port discovery optimized for scanning large networks quickly.

**Characteristics**:
- Asynchronous packet transmission (very fast)
- Native banner grabbing support
- JSON output format
- Supports rate limiting via `--rate` parameter
- Supports port exclusions via `--exclude-ports`

**Command Structure**:
```bash
masscan <CIDR> -p<PORT_SPEC> --banners --wait <seconds> -oJ <output>
  [--exclude-ports <ports>] [--rate <pps>]
```

**When to Use**:
- Large network ranges (hundreds/thousands of hosts)
- Initial discovery scans
- When speed is prioritized over service identification

### Nmap

**Purpose**: Thorough scanning with accurate service detection capabilities.

**Characteristics**:
- More accurate port state detection
- Built-in service version detection (`-sV`)
- XML output format
- Uses timing templates (`-T4` for aggressive)

**Command Structure (Phase 1 - Port Discovery)**:
```bash
nmap -sS|-sU -n --max-rtt-timeout <ms> -T4 [-6] -oX <output> <CIDR>
```

**Command Structure (Phase 2 - Service Detection)**:
```bash
nmap -sV --version-intensity 5 -n -T4 [-6] -iL <targets> -oX <output>
```

**When to Use**:
- Smaller, targeted networks
- When accurate service identification is needed
- When UDP scanning is required

### Comparison

| Feature | Masscan | Nmap |
|---------|---------|------|
| Speed | Very fast | Slower but thorough |
| Service Detection | Banners only | Full service fingerprinting |
| Rate Control | `--rate` (pps) | Timing templates |
| IPv6 Support | Native | `-6` flag |
| Port Exclusions | `--exclude-ports` | Not supported |
| Output Format | JSON | XML |

## Hybrid Scanning Approach

The scanner implements a hybrid approach that combines masscan's speed with nmap's accuracy.

### Flow Diagram

```
                    ┌───────────────────┐
                    │   Job Received    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ scanner_type?     │
                    └─────────┬─────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  │
    ┌─────────────┐    ┌─────────────┐          │
    │  "masscan"  │    │   "nmap"    │          │
    └──────┬──────┘    └──────┬──────┘          │
           │                  │                  │
           ▼                  │                  │
    ┌─────────────┐          │                  │
    │   Masscan   │          │                  │
    │  Discovery  │          │                  │
    │   (0-75%)   │          │                  │
    └──────┬──────┘          │                  │
           │                  │                  │
           ▼                  ▼                  │
    ┌─────────────┐    ┌─────────────┐          │
    │ Nmap Service│    │ Nmap Phase 1│          │
    │  Detection  │    │  Discovery  │          │
    │  (75-100%)  │    │   (0-50%)   │          │
    └──────┬──────┘    └──────┬──────┘          │
           │                  │                  │
           │                  ▼                  │
           │           ┌─────────────┐          │
           │           │ Nmap Phase 2│          │
           │           │   Service   │          │
           │           │  (50-100%)  │          │
           │           └──────┬──────┘          │
           │                  │                  │
           └────────┬─────────┘                  │
                    │                            │
                    ▼                            │
           ┌───────────────────┐                │
           │  Submit Results   │◀───────────────┘
           └───────────────────┘
```

### Masscan + Nmap Service Detection

When `scanner_type == "masscan"`, the scanner:

1. **Masscan Phase (0-75% progress)**:
   - Runs masscan for fast port discovery
   - Captures banners, MAC addresses, and vendors
   - Reports progress based on masscan's stderr output

2. **Nmap Service Detection Phase (75-100% progress)**:
   - Groups discovered open ports by IP
   - Runs nmap with `-sV --version-intensity 5`
   - Merges service information back into masscan results
   - Uses PTY for real-time progress output

### Nmap Two-Phase Scanning

When `scanner_type == "nmap"`, the scanner:

1. **Phase 1 - Port Discovery (0-50% progress)**:
   - Runs nmap with SYN scan (`-sS`) and/or UDP scan (`-sU`)
   - Uses 70% of the total scan timeout
   - Aggressive timing (`-T4`) for speed

2. **Phase 2 - Service Detection (50-100% progress)**:
   - Scans only ports found in Phase 1
   - Uses 30% of the total scan timeout (minimum 120s)
   - Identifies service names, versions, and products

## IPv6 Scanning Support

The scanner fully supports IPv6 networks.

### Connectivity Check

Before any IPv6 scan, the scanner verifies IPv6 connectivity:

```python
# Tests connectivity to these well-known IPv6 DNS servers:
# - 2001:4860:4860::8888 (Google DNS)
# - 2606:4700:4700::1111 (Cloudflare DNS)
```

If connectivity fails, the scan is aborted with a clear error message.

### IPv6 in Jobs

The backend determines if a network is IPv6 and sets `is_ipv6: true` in the job payload.

### Scanner-Specific Handling

- **Masscan**: Natively supports IPv6 CIDRs without special flags
- **Nmap**: Uses the `-6` flag for IPv6 mode

## Host Discovery

Host discovery uses nmap ping scans to find active hosts on a network without port scanning.

### Command

```bash
nmap -sn -PE --disable-arp-ping -R [-6] --host-timeout <seconds>s -oX <output> <CIDR>
```

**Flags Explained**:
| Flag | Purpose |
|------|---------|
| `-sn` | Ping scan only (no port scanning) |
| `-PE` | ICMP echo request only |
| `--disable-arp-ping` | Don't use ARP (avoids finding all local hosts) |
| `-R` | Always perform reverse DNS lookup |
| `-6` | IPv6 mode (if applicable) |
| `--host-timeout` | Timeout per host |

### Output

For each discovered host, the scanner reports:
- IP address
- Hostname (from reverse DNS)
- Ping status (up/down)
- MAC address and vendor (if locally connected)

### Workflow

```
┌─────────────────────┐
│ Poll for Discovery  │
│       Jobs          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Claim Discovery Job │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Run Nmap Ping Scan │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Parse XML Results  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Submit Host        │
│  Discovery Results  │
└─────────────────────┘
```

## Job Lifecycle

### Polling and Claiming

```
┌──────────────────────────────────────────────────────────────┐
│                       Main Loop                              │
│                                                              │
│  1. GET /api/scanner/jobs         ←─── Poll for jobs         │
│                                                              │
│  2. For each job:                                            │
│     POST /api/scanner/jobs/{network_id}/claim                │
│                                                              │
│  3. If claim succeeds (returns scan_id):                     │
│     Execute scan                                             │
│                                                              │
│  4. Sleep for POLL_INTERVAL seconds                          │
│                                                              │
│  5. Repeat                                                   │
└──────────────────────────────────────────────────────────────┘
```

### Progress Reporting

A background thread reports progress every 5 seconds:

- **Thread-safe updates**: Progress and message can be updated from scan threads
- **Smart reporting**: Only sends when values change
- **Failure handling**: Network failures don't interrupt the scan

**Progress Scaling by Phase**:
| Scan Type | Phase | Progress Range |
|-----------|-------|----------------|
| Masscan | Port Discovery | 0-75% |
| Masscan | Service Detection | 75-100% |
| Nmap | Phase 1 (Discovery) | 0-50% |
| Nmap | Phase 2 (Service) | 50-100% |

### Log Streaming

A background thread streams logs every 5 seconds:

- **Buffer**: Logs are captured via a custom logging handler
- **Retry**: Failed submissions are requeued for the next attempt
- **Format**: Each entry includes timestamp, level, and message

**Log Levels**:
- `info`: Normal operation messages
- `warning`: Non-fatal issues
- `error`: Failures and exceptions

### Result Submission

After scan completion, results are submitted to the backend:

```
POST /api/scanner/results
{
    "scan_id": 123,
    "status": "success" | "failed",
    "open_ports": [...],
    "error_message": null | "Error description"
}
```

**Open Port Data**:
```json
{
    "ip": "192.168.1.1",
    "port": 443,
    "protocol": "tcp",
    "ttl": 64,
    "banner": "HTTP/1.1 200 OK",
    "service_guess": "https",
    "mac_address": "00:11:22:33:44:55",
    "mac_vendor": "Cisco Systems"
}
```

## Cancellation Handling

The scanner supports graceful cancellation of running scans.

### Detection

A background thread polls the scan status every 5 seconds:

```
GET /api/scanner/scans/{scan_id}/status
```

If status is `cancelled`:
1. Set the cancellation flag
2. Send SIGTERM to the scanning process
3. Wait 5 seconds for graceful exit
4. Send SIGKILL if process still running

### Partial Results

When a scan is cancelled:
- Results collected up to that point are submitted
- Status is set to "failed" with error message "Scan cancelled by user request"
- Progress reporter and log streamer are stopped gracefully

## Timeout Handling

### Scan Timeout

The total time allowed for a complete scan (including all phases).

**Masscan**: A background timeout watcher:
1. Logs warning at 90% of timeout elapsed
2. Terminates process at 100% of timeout
3. Uses SIGTERM then SIGKILL if needed

**Nmap**: Inline timeout tracking:
1. Phase 1 gets 70% of total timeout
2. Phase 2 gets 30% (minimum 120 seconds)
3. Warning at 90%, termination at 100%

### Port Timeout

The time to wait for a response from each port.

- **Masscan**: Converted to `--wait` parameter (seconds)
- **Nmap**: Used as `--max-rtt-timeout` (milliseconds)

## Error Handling and Retry

### HTTP Request Retry

The scanner client implements exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s (capped at 30s) |

**Retry Conditions**:
- Network errors: Retry
- 429 (Rate Limited): Retry
- 5xx (Server Error): Retry
- 401 (Unauthorized): Re-authenticate and retry once
- 404/409: No retry (return immediately)

### Process Failure Handling

If masscan or nmap fails:
1. Exception is logged with full traceback
2. Results submitted with status "failed"
3. Error message includes the exception details

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Scanner Startup                          │
│                                                             │
│  1. Load API_KEY from environment                           │
│                                                             │
│  2. POST /api/scanner/auth                                  │
│     Header: X-API-Key: <api_key>                           │
│                                                             │
│  3. Receive JWT token:                                      │
│     {                                                       │
│       "access_token": "eyJ...",                            │
│       "expires_in": 900  // 15 minutes                     │
│     }                                                       │
│                                                             │
│  4. Store token with expiry (expires_in - 30 seconds)      │
│                                                             │
│  5. Use JWT for all subsequent requests:                    │
│     Header: Authorization: Bearer <jwt_token>              │
│                                                             │
│  6. Re-authenticate when token is 90% expired              │
└─────────────────────────────────────────────────────────────┘
```

## Data Structures

### ScannerJob

```python
network_id: int       # Network to scan
cidr: str             # IP range (e.g., "192.168.1.0/24")
port_spec: str        # Ports (e.g., "80,443,1-1000,!22")
rate: int | None      # Packets per second (masscan only)
scanner_type: str     # "masscan" or "nmap"
scan_timeout: int     # Total timeout (seconds)
port_timeout: int     # Per-port timeout (milliseconds)
scan_protocol: str    # "tcp", "udp", or "both"
is_ipv6: bool         # IPv6 network flag
```

### Port Specification Format

**Include Ports**:
- Single: `80`
- Range: `80-443`
- Multiple: `80,443,8080`

**Exclude Ports** (masscan only):
- Prefix with `!`: `!22,!25`

**Combined Example**: `1-1000,8080,!22,!25`

### Protocol Handling

For masscan port specifications:
- TCP only: `-p 80,443` or `-p T:80,443`
- UDP only: `-pU:80,443`
- Both: `-p T:80,443,U:80,443`

## Dependencies

The scanner requires these external tools:

| Tool | Purpose | Required Capabilities |
|------|---------|----------------------|
| masscan | Fast port scanning | `NET_RAW` |
| nmap | Service detection, host discovery | `NET_RAW`, `NET_ADMIN` |

The scanner checks for these at startup and logs warnings if missing.
