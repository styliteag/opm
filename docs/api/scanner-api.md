# Scanner API

The Scanner API provides endpoints for scanner agents to authenticate, retrieve jobs, submit results, and report progress. These endpoints are exclusively for use by scanner agents, not human users.

## Authentication

Scanner agents authenticate using an API key to receive a short-lived JWT token. See [Authentication](authentication.md#scanner-authentication) for the full authentication flow.

All Scanner API endpoints (except `/auth`) require a valid scanner JWT token in the Authorization header:

```
Authorization: Bearer <scanner_jwt_token>
```

## Scan Workflow

A typical port scanning workflow follows these steps:

1. **Authenticate** - Call `/auth` with API key to get JWT
2. **Poll for jobs** - Call `/jobs` to check for pending scans
3. **Claim job** - Call `/jobs/{network_id}/claim` to claim a scan
4. **Report progress** - Periodically call `/progress` during scanning
5. **Submit logs** - Call `/logs` to stream scan logs
6. **Submit results** - Call `/results` with final scan data
7. **Check status** - Optionally call `/scans/{id}/status` to verify

Host discovery follows a similar pattern using the host discovery endpoints.

---

## POST /api/scanner/auth

Authenticate a scanner using its API key.

**Authentication Required:** API Key (via `X-Api-Key` header)

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `X-Api-Key` | Yes | The scanner's API key |

**Request Body (Optional):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scanner_version` | string | No | Version of the scanner agent |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/auth" \
  -H "X-Api-Key: your-scanner-api-key" \
  -H "Content-Type: application/json" \
  -d '{"scanner_version": "1.2.0"}'
```

**Response (200 OK):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "scanner_id": 1,
  "scanner_name": "office-scanner"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT token for subsequent requests |
| `token_type` | string | Always `"bearer"` |
| `expires_in` | integer | Token validity in seconds (900 = 15 minutes) |
| `scanner_id` | integer | Unique scanner identifier |
| `scanner_name` | string | Human-readable scanner name |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid API key |
| 429 | Rate limit exceeded (10 attempts per minute per IP) |

---

## GET /api/scanner/jobs

Get pending scan jobs for this scanner.

**Authentication Required:** Scanner JWT

Returns networks that need scanning based on manual or scheduled triggers. Also updates the scanner's `last_seen_at` timestamp (heartbeat).

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/scanner/jobs" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "jobs": [
    {
      "network_id": 5,
      "cidr": "192.168.1.0/24",
      "port_spec": "22,80,443,8080-8090",
      "rate": 1000,
      "scanner_type": "masscan",
      "scan_timeout": 3600,
      "port_timeout": 1500,
      "scan_protocol": "tcp",
      "is_ipv6": false
    },
    {
      "network_id": 8,
      "cidr": "10.0.0.0/16",
      "port_spec": "1-1000",
      "rate": null,
      "scanner_type": "nmap",
      "scan_timeout": 7200,
      "port_timeout": 2000,
      "scan_protocol": "both",
      "is_ipv6": false
    }
  ]
}
```

**Job Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `network_id` | integer | Network ID to scan |
| `cidr` | string | Network CIDR notation (e.g., `192.168.1.0/24`) |
| `port_spec` | string | Ports to scan in masscan format (e.g., `22,80,443,8080-8090`) |
| `rate` | integer | Scan rate (packets/sec for masscan), null uses default |
| `scanner_type` | string | Scan method: `masscan` or `nmap` |
| `scan_timeout` | integer | Overall scan timeout in seconds (default: 3600) |
| `port_timeout` | integer | Per-port timeout in milliseconds (default: 1500) |
| `scan_protocol` | string | Protocol to scan: `tcp`, `udp`, or `both` |
| `is_ipv6` | boolean | Whether the network CIDR is IPv6 |

---

## POST /api/scanner/jobs/{network_id}/claim

Claim a scan job for a network.

**Authentication Required:** Scanner JWT

Marks the job as in-progress and creates the scan record.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `network_id` | integer | Network ID to claim |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/jobs/5/claim" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "scan_id": 42,
  "network_id": 5,
  "message": "Job claimed successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Unique scan ID for progress/result submission |
| `network_id` | integer | Network ID that was claimed |
| `message` | string | Confirmation message |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Network not found or not assigned to this scanner |
| 409 | Job already claimed or running |

---

## POST /api/scanner/results

Submit scan results from a scanner.

**Authentication Required:** Scanner JWT

Submits the final scan results including all discovered open ports.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scan_id` | integer | Yes | Scan ID from job claim |
| `status` | string | Yes | Final status: `success` or `failed` |
| `open_ports` | array | No | List of discovered open ports |
| `error_message` | string | No | Error description if status is `failed` |

**Open Port Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | Yes | Host IP address |
| `port` | integer | Yes | Port number |
| `protocol` | string | No | Protocol: `tcp` (default) or `udp` |
| `ttl` | integer | No | Time-to-live value |
| `banner` | string | No | Service banner if detected |
| `service_guess` | string | No | Service identification guess |
| `mac_address` | string | No | MAC address if available |
| `mac_vendor` | string | No | MAC address vendor lookup |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/results" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 42,
    "status": "success",
    "open_ports": [
      {
        "ip": "192.168.1.10",
        "port": 22,
        "protocol": "tcp",
        "ttl": 64,
        "banner": "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1",
        "service_guess": "ssh"
      },
      {
        "ip": "192.168.1.10",
        "port": 80,
        "protocol": "tcp",
        "ttl": 64,
        "banner": "HTTP/1.1 200 OK",
        "service_guess": "http"
      },
      {
        "ip": "192.168.1.25",
        "port": 443,
        "protocol": "tcp",
        "ttl": 128,
        "service_guess": "https"
      }
    ]
  }'
```

**Response (200 OK):**

```json
{
  "scan_id": 42,
  "status": "success",
  "ports_recorded": 3,
  "message": "Results submitted successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Scan ID that received results |
| `status` | string | Final scan status |
| `ports_recorded` | integer | Number of open ports recorded |
| `message` | string | Confirmation message |

**Example Failed Scan:**

```bash
curl -X POST "http://localhost:8000/api/scanner/results" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 42,
    "status": "failed",
    "error_message": "Network unreachable: no route to host"
  }'
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Scan is not in RUNNING or CANCELLED status |
| 404 | Scan not found or not assigned to this scanner |

---

## POST /api/scanner/logs

Submit scan logs from a scanner.

**Authentication Required:** Scanner JWT

Streams log entries to be stored with the scan record.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scan_id` | integer | Yes | Scan ID from job claim |
| `logs` | array | Yes | Array of log entries |

**Log Entry Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | string | Yes | ISO 8601 timestamp |
| `level` | string | Yes | Log level: `info`, `warning`, or `error` |
| `message` | string | Yes | Log message content |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/logs" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 42,
    "logs": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "level": "info",
        "message": "Starting masscan for 192.168.1.0/24"
      },
      {
        "timestamp": "2024-01-15T10:30:05Z",
        "level": "info",
        "message": "Scanning ports: 22,80,443,8080-8090"
      },
      {
        "timestamp": "2024-01-15T10:31:15Z",
        "level": "warning",
        "message": "Host 192.168.1.50 not responding, retrying..."
      },
      {
        "timestamp": "2024-01-15T10:35:00Z",
        "level": "info",
        "message": "Scan completed, found 3 open ports"
      }
    ]
  }'
```

**Response (200 OK):**

```json
{
  "scan_id": 42,
  "logs_recorded": 4,
  "message": "Logs submitted successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Scan ID that received logs |
| `logs_recorded` | integer | Number of log entries recorded |
| `message` | string | Confirmation message |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Scan not found or not assigned to this scanner |

---

## POST /api/scanner/progress

Update scan progress from a scanner.

**Authentication Required:** Scanner JWT

Reports scanning progress percentage and status message.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scan_id` | integer | Yes | Scan ID from job claim |
| `progress_percent` | float | Yes | Progress percentage (0-100) |
| `progress_message` | string | No | Human-readable progress description |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/progress" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 42,
    "progress_percent": 45.5,
    "progress_message": "Scanning port range 1000-2000"
  }'
```

**Response (200 OK):**

```json
{
  "scan_id": 42,
  "progress_percent": 45.5,
  "message": "Progress updated successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Scan ID that was updated |
| `progress_percent` | float | Current progress percentage |
| `message` | string | Confirmation message |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | `progress_percent` not between 0 and 100 |
| 404 | Scan not found, not assigned to this scanner, or not in RUNNING status |

---

## GET /api/scanner/scans/{scan_id}/status

Get current scan status for the scanner.

**Authentication Required:** Scanner JWT

Used to check if a scan has been cancelled (e.g., by a user) so the scanner can stop early.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | integer | Scan ID to check |

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/scanner/scans/42/status" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "scan_id": 42,
  "status": "running",
  "message": "Status retrieved successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Scan ID queried |
| `status` | string | Current status: `planned`, `running`, `completed`, `failed`, `cancelled` |
| `message` | string | Confirmation message |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Scan not found or not assigned to this scanner |

---

## Host Discovery Endpoints

Host discovery is a separate scanning mode that discovers live hosts on a network using ping scans. Networks must have `host_discovery_enabled: true` to generate discovery jobs.

### GET /api/scanner/host-discovery-jobs

Get pending host discovery jobs for this scanner.

**Authentication Required:** Scanner JWT

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/scanner/host-discovery-jobs" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "jobs": [
    {
      "scan_id": 15,
      "network_id": 5,
      "cidr": "192.168.1.0/24",
      "is_ipv6": false
    },
    {
      "scan_id": 18,
      "network_id": 12,
      "cidr": "2001:db8::/64",
      "is_ipv6": true
    }
  ]
}
```

**Job Object Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Host discovery scan ID |
| `network_id` | integer | Network ID to discover hosts on |
| `cidr` | string | Network CIDR notation |
| `is_ipv6` | boolean | Whether the network is IPv6 |

---

### POST /api/scanner/host-discovery-jobs/{scan_id}/claim

Claim a host discovery job.

**Authentication Required:** Scanner JWT

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | integer | Host discovery scan ID to claim |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/host-discovery-jobs/15/claim" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "scan_id": 15,
  "network_id": 5,
  "cidr": "192.168.1.0/24",
  "is_ipv6": false,
  "message": "Host discovery job claimed successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Claimed scan ID |
| `network_id` | integer | Network ID |
| `cidr` | string | Network CIDR to scan |
| `is_ipv6` | boolean | Whether the network is IPv6 |
| `message` | string | Confirmation message |

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Host discovery job not found or not assigned to this scanner |
| 409 | Job already claimed or running |

---

### POST /api/scanner/host-discovery-results

Submit host discovery results from a scanner.

**Authentication Required:** Scanner JWT

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scan_id` | integer | Yes | Host discovery scan ID |
| `status` | string | Yes | Final status: `success` or `failed` |
| `hosts` | array | No | List of discovered hosts |
| `error_message` | string | No | Error description if status is `failed` |

**Host Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | Yes | Host IP address |
| `hostname` | string | No | Resolved hostname |
| `is_pingable` | boolean | No | Whether host responded to ping (default: true) |
| `mac_address` | string | No | MAC address if available |
| `mac_vendor` | string | No | MAC address vendor lookup |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/scanner/host-discovery-results" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 15,
    "status": "success",
    "hosts": [
      {
        "ip": "192.168.1.1",
        "hostname": "router.local",
        "is_pingable": true,
        "mac_address": "aa:bb:cc:dd:ee:ff",
        "mac_vendor": "Cisco Systems"
      },
      {
        "ip": "192.168.1.10",
        "hostname": "workstation-01.local",
        "is_pingable": true
      },
      {
        "ip": "192.168.1.25",
        "hostname": null,
        "is_pingable": true
      }
    ]
  }'
```

**Response (200 OK):**

```json
{
  "scan_id": 15,
  "status": "success",
  "hosts_recorded": 3,
  "message": "Host discovery results submitted successfully"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | Scan ID that received results |
| `status` | string | Final scan status |
| `hosts_recorded` | integer | Number of hosts recorded |
| `message` | string | Confirmation message |

**Example Failed Discovery:**

```bash
curl -X POST "http://localhost:8000/api/scanner/host-discovery-results" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "scan_id": 15,
    "status": "failed",
    "error_message": "Permission denied: requires NET_RAW capability"
  }'
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 404 | Host discovery scan not found or not assigned to this scanner |

---

## Complete Scan Workflow Example

Here's a complete example of a scanner performing a port scan:

```bash
# 1. Authenticate
TOKEN=$(curl -s -X POST "http://localhost:8000/api/scanner/auth" \
  -H "X-Api-Key: your-api-key" | jq -r '.access_token')

# 2. Poll for jobs
curl -s -X GET "http://localhost:8000/api/scanner/jobs" \
  -H "Authorization: Bearer $TOKEN"

# 3. Claim a job (returns scan_id)
SCAN_ID=$(curl -s -X POST "http://localhost:8000/api/scanner/jobs/5/claim" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.scan_id')

# 4. Report progress during scan
curl -s -X POST "http://localhost:8000/api/scanner/progress" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scan_id\": $SCAN_ID, \"progress_percent\": 25, \"progress_message\": \"Scanning ports 1-1000\"}"

# 5. Check if scan was cancelled
curl -s -X GET "http://localhost:8000/api/scanner/scans/$SCAN_ID/status" \
  -H "Authorization: Bearer $TOKEN"

# 6. Submit logs
curl -s -X POST "http://localhost:8000/api/scanner/logs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scan_id\": $SCAN_ID, \"logs\": [{\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"level\": \"info\", \"message\": \"Scan completed\"}]}"

# 7. Submit results
curl -s -X POST "http://localhost:8000/api/scanner/results" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scan_id\": $SCAN_ID, \"status\": \"success\", \"open_ports\": [{\"ip\": \"192.168.1.10\", \"port\": 22, \"protocol\": \"tcp\"}]}"
```

---

## Error Handling

All Scanner API endpoints return errors in a consistent format:

```json
{
  "detail": "Error message describing the problem"
}
```

**Common Error Scenarios:**

| Status | Scenario | Solution |
|--------|----------|----------|
| 401 | Token expired | Re-authenticate with `/auth` |
| 401 | Invalid API key | Verify API key is correct |
| 404 | Job/scan not found | Verify ID and scanner assignment |
| 409 | Job already claimed | Skip this job, poll for others |
| 429 | Rate limit on auth | Wait 60 seconds before retrying |

Scanners should implement retry logic with exponential backoff for transient errors (5xx status codes).
