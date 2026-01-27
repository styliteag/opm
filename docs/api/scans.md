# Scans API

The Scans API provides endpoints for viewing scan details, comparing scans, accessing scan logs, cancelling running scans, and exporting scan results.

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

| Endpoint | Auth Required |
|----------|---------------|
| GET /api/scans | Any authenticated user |
| GET /api/scans/{id} | Any authenticated user |
| GET /api/scans/{id}/diff | Any authenticated user |
| GET /api/scans/{id}/logs | Any authenticated user |
| POST /api/scans/{id}/cancel | Admin only |
| PATCH /api/scans/{id}/visibility | Admin only |
| DELETE /api/scans/{id} | Admin only |
| GET /api/scans/{id}/export/csv | Any authenticated user |
| GET /api/scans/{id}/export/pdf | Any authenticated user |

---

## Scan Status Values

Scans progress through the following status states:

| Status | Description |
|--------|-------------|
| `planned` | Scan is queued and waiting for a scanner to pick it up |
| `running` | Scan is currently in progress |
| `completed` | Scan finished successfully |
| `failed` | Scan encountered an error |
| `cancelled` | Scan was manually cancelled by an admin |

## Trigger Types

| Type | Description |
|------|-------------|
| `manual` | Triggered by a user via the UI or API |
| `scheduled` | Triggered automatically by the cron schedule |

---

## List All Scans

Retrieves a paginated list of all scans with optional filtering by network.

```
GET /api/scans
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `network_id` | integer | No | - | Filter scans by network ID |
| `include_hidden` | boolean | No | `false` | Include hidden scans in results |
| `offset` | integer | No | 0 | Number of records to skip |
| `limit` | integer | No | 50 | Maximum records to return (max: 200) |

### Response

```json
{
  "scans": [
    {
      "id": 42,
      "network_id": 1,
      "network_name": "Production Network",
      "scanner_id": 3,
      "scanner_name": "HQ Scanner",
      "status": "completed",
      "started_at": "2025-01-27T10:00:00",
      "completed_at": "2025-01-27T10:15:30",
      "cancelled_at": null,
      "cancelled_by": null,
      "cancelled_by_email": null,
      "error_message": null,
      "trigger_type": "scheduled",
      "progress_percent": 100.0,
      "progress_message": "Scan completed",
      "hidden": false,
      "port_count": 47
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique scan identifier |
| `network_id` | integer | ID of the scanned network |
| `network_name` | string | Name of the scanned network |
| `scanner_id` | integer | ID of the scanner that executed the scan |
| `scanner_name` | string | Name of the scanner |
| `status` | string | Current scan status (see status values above) |
| `started_at` | datetime\|null | When scanning actually began |
| `completed_at` | datetime\|null | When scan finished successfully |
| `cancelled_at` | datetime\|null | When scan was cancelled (if applicable) |
| `cancelled_by` | integer\|null | User ID who cancelled the scan |
| `cancelled_by_email` | string\|null | Email of user who cancelled |
| `error_message` | string\|null | Error details if scan failed |
| `trigger_type` | string | How the scan was initiated (`manual` or `scheduled`) |
| `progress_percent` | float\|null | Completion percentage (0-100) |
| `progress_message` | string\|null | Human-readable progress status |
| `hidden` | boolean | Whether scan is hidden from default listings |
| `port_count` | integer | Number of open ports discovered |

### Example Requests

```bash
# List all visible scans
curl "http://localhost:8000/api/scans" \
  -H "Authorization: Bearer <token>"

# Filter by network
curl "http://localhost:8000/api/scans?network_id=1" \
  -H "Authorization: Bearer <token>"

# Include hidden scans
curl "http://localhost:8000/api/scans?include_hidden=true&limit=100" \
  -H "Authorization: Bearer <token>"
```

---

## Get Scan Details

Retrieves detailed information about a specific scan including all open ports discovered.

```
GET /api/scans/{scan_id}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Response

```json
{
  "id": 42,
  "network_id": 1,
  "scanner_id": 3,
  "status": "completed",
  "started_at": "2025-01-27T10:00:00",
  "completed_at": "2025-01-27T10:15:30",
  "cancelled_at": null,
  "cancelled_by": null,
  "cancelled_by_email": null,
  "error_message": null,
  "trigger_type": "scheduled",
  "hidden": false,
  "progress_percent": 100.0,
  "progress_message": "Scan completed",
  "open_ports": [
    {
      "ip": "192.168.1.100",
      "port": 80,
      "protocol": "tcp",
      "ttl": 64,
      "banner": "Apache/2.4.41 (Ubuntu)",
      "service_guess": "http",
      "mac_address": "00:11:22:33:44:55",
      "mac_vendor": "Dell Inc.",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T10:15:30"
    },
    {
      "ip": "192.168.1.100",
      "port": 443,
      "protocol": "tcp",
      "ttl": 64,
      "banner": null,
      "service_guess": "https",
      "mac_address": "00:11:22:33:44:55",
      "mac_vendor": "Dell Inc.",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T10:15:30"
    }
  ]
}
```

### Open Port Fields

| Field | Type | Description |
|-------|------|-------------|
| `ip` | string | IP address where port was discovered |
| `port` | integer | Port number |
| `protocol` | string | Protocol (`tcp` or `udp`) |
| `ttl` | integer\|null | TTL value from response packet |
| `banner` | string\|null | Service banner grabbed during scan |
| `service_guess` | string\|null | Detected service name |
| `mac_address` | string\|null | MAC address of the host |
| `mac_vendor` | string\|null | Vendor from MAC address lookup |
| `first_seen_at` | datetime | When port was first discovered open |
| `last_seen_at` | datetime | Most recent discovery timestamp |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Scan found and returned |
| 401 | Missing or invalid authentication |
| 404 | Scan not found |

### Example Request

```bash
curl "http://localhost:8000/api/scans/42" \
  -H "Authorization: Bearer <token>"
```

---

## Compare Scans (Diff)

Compares two scans to identify added, removed, and unchanged open ports. Both scans must belong to the same network.

```
GET /api/scans/{scan_id}/diff
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The base scan ID |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `compare_to` | integer | Yes | The scan ID to compare against |

### Response

```json
{
  "scan_id": 42,
  "compare_to_id": 40,
  "added_ports": [
    {
      "ip": "192.168.1.150",
      "port": 8080,
      "protocol": "tcp",
      "ttl": 64,
      "banner": "Tomcat/9.0",
      "service_guess": "http-proxy",
      "mac_address": null,
      "mac_vendor": null,
      "first_seen_at": "2025-01-27T10:15:00",
      "last_seen_at": "2025-01-27T10:15:00"
    }
  ],
  "removed_ports": [
    {
      "ip": "192.168.1.100",
      "port": 22,
      "protocol": "tcp",
      "ttl": 64,
      "banner": "SSH-2.0-OpenSSH_8.2",
      "service_guess": "ssh",
      "mac_address": "00:11:22:33:44:55",
      "mac_vendor": "Dell Inc.",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-26T10:00:00"
    }
  ],
  "unchanged_ports": [
    {
      "ip": "192.168.1.100",
      "port": 80,
      "protocol": "tcp",
      "ttl": 64,
      "banner": "Apache/2.4.41",
      "service_guess": "http",
      "mac_address": "00:11:22:33:44:55",
      "mac_vendor": "Dell Inc.",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T10:15:00"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `scan_id` | integer | The base scan ID |
| `compare_to_id` | integer | The comparison scan ID |
| `added_ports` | array | Ports found in base scan but not in comparison scan |
| `removed_ports` | array | Ports found in comparison scan but not in base scan |
| `unchanged_ports` | array | Ports found in both scans |

Ports are uniquely identified by the combination of (ip, port, protocol).

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Diff computed successfully |
| 400 | Scans belong to different networks |
| 401 | Missing or invalid authentication |
| 404 | Scan or comparison scan not found |

### Example Requests

```bash
# Compare scan 42 to scan 40
curl "http://localhost:8000/api/scans/42/diff?compare_to=40" \
  -H "Authorization: Bearer <token>"
```

---

## Get Scan Logs

Retrieves paginated log entries recorded during scan execution.

```
GET /api/scans/{scan_id}/logs
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `offset` | integer | No | 0 | Number of records to skip |
| `limit` | integer | No | 50 | Maximum records to return (max: 200) |

### Response

```json
{
  "logs": [
    {
      "timestamp": "2025-01-27T10:00:00",
      "level": "info",
      "message": "Starting scan for network Production Network"
    },
    {
      "timestamp": "2025-01-27T10:00:05",
      "level": "info",
      "message": "Running masscan on 192.168.1.0/24"
    },
    {
      "timestamp": "2025-01-27T10:10:00",
      "level": "info",
      "message": "Masscan complete, found 47 open ports"
    },
    {
      "timestamp": "2025-01-27T10:10:05",
      "level": "info",
      "message": "Running nmap service detection on 47 ports"
    },
    {
      "timestamp": "2025-01-27T10:15:30",
      "level": "info",
      "message": "Scan completed successfully"
    }
  ]
}
```

### Log Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | datetime | When the log entry was recorded |
| `level` | string | Log level: `info`, `warning`, or `error` |
| `message` | string | Log message content |

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Logs retrieved successfully |
| 401 | Missing or invalid authentication |
| 404 | Scan not found |

### Example Request

```bash
# Get first 100 log entries
curl "http://localhost:8000/api/scans/42/logs?limit=100" \
  -H "Authorization: Bearer <token>"
```

---

## Cancel Scan

Cancels a running scan. Only scans with status `running` can be cancelled.

```
POST /api/scans/{scan_id}/cancel
```

**Requires admin authentication.**

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Response

```json
{
  "scan_id": 42,
  "status": "cancelled",
  "cancelled_at": "2025-01-27T10:12:00",
  "cancelled_by": 1,
  "message": "Scan cancelled successfully"
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Scan cancelled successfully |
| 401 | Missing or invalid authentication |
| 403 | User is not an admin |
| 404 | Scan not found |
| 409 | Scan is not running (cannot cancel) |

### Example Request

```bash
curl -X POST "http://localhost:8000/api/scans/42/cancel" \
  -H "Authorization: Bearer <token>"
```

---

## Update Scan Visibility

Shows or hides a scan from the default listing. Hidden scans are useful for decluttering the scan history while preserving data.

```
PATCH /api/scans/{scan_id}/visibility
```

**Requires admin authentication.**

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hidden` | boolean | Yes | `true` to hide, `false` to show |

### Example Request

```bash
# Hide a scan
curl -X PATCH "http://localhost:8000/api/scans/42/visibility" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"hidden": true}'

# Show a hidden scan
curl -X PATCH "http://localhost:8000/api/scans/42/visibility" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"hidden": false}'
```

### Response

Returns the updated scan object (same schema as Get Scan Details, without `open_ports`).

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Visibility updated successfully |
| 401 | Missing or invalid authentication |
| 403 | User is not an admin |
| 404 | Scan not found |

---

## Delete Scan

Permanently deletes a scan and all related data (open ports, logs, alerts).

```
DELETE /api/scans/{scan_id}
```

**Requires admin authentication.**

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Status Codes

| Code | Description |
|------|-------------|
| 204 | Scan deleted successfully (no content) |
| 401 | Missing or invalid authentication |
| 403 | User is not an admin |
| 404 | Scan not found |

### Example Request

```bash
curl -X DELETE "http://localhost:8000/api/scans/42" \
  -H "Authorization: Bearer <token>"
```

---

## Export Scan Results as CSV

Exports the open ports from a scan as a CSV file.

```
GET /api/scans/{scan_id}/export/csv
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Response

Returns a CSV file with the following columns:

- IP
- Port
- Protocol
- Service
- First Seen
- Last Seen

**Content-Type:** `text/csv`
**Filename:** `scan_{id}_{timestamp}.csv`

### Example CSV Output

```csv
IP,Port,Protocol,Service,First Seen,Last Seen
192.168.1.100,80,tcp,http,2025-01-15T10:00:00,2025-01-27T10:15:30
192.168.1.100,443,tcp,https,2025-01-15T10:00:00,2025-01-27T10:15:30
192.168.1.150,22,tcp,ssh,2025-01-20T08:00:00,2025-01-27T10:15:30
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | CSV file returned |
| 401 | Missing or invalid authentication |
| 404 | Scan not found |

### Example Request

```bash
curl "http://localhost:8000/api/scans/42/export/csv" \
  -H "Authorization: Bearer <token>" \
  -o scan_results.csv
```

---

## Export Scan Results as PDF

Exports a formatted PDF report of scan results.

```
GET /api/scans/{scan_id}/export/pdf
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scan_id` | integer | Yes | The scan ID |

### Response

Returns a PDF document containing:

1. **Title:** "Scan Report - ID: {id}"
2. **Scan metadata:**
   - Network name
   - Scan date
   - Status
   - Completion time
3. **Summary statistics:**
   - Total open ports found
4. **Detailed ports table:** IP, Port, Protocol, Service, First Seen, Last Seen

**Content-Type:** `application/pdf`
**Filename:** `scan_{id}_{timestamp}.pdf`

### Status Codes

| Code | Description |
|------|-------------|
| 200 | PDF file returned |
| 401 | Missing or invalid authentication |
| 404 | Scan not found |

### Example Request

```bash
curl "http://localhost:8000/api/scans/42/export/pdf" \
  -H "Authorization: Bearer <token>" \
  -o scan_report.pdf
```

---

## Error Responses

All error responses follow the standard format:

```json
{
  "detail": "Error message describing the issue"
}
```

### Common Errors

| Status | Scenario | Detail |
|--------|----------|--------|
| 400 | Comparing scans from different networks | `Scans must belong to the same network` |
| 401 | Missing/invalid token | `Could not validate credentials` |
| 403 | Non-admin on admin endpoint | `Admin access required` |
| 404 | Scan not found | `Scan not found` |
| 404 | Comparison scan not found | `Compare scan not found` |
| 409 | Cancelling non-running scan | `Scan is not running` |
