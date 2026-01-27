# Hosts API

The Hosts API provides endpoints for managing discovered hosts, viewing their details, and exporting host inventory data.

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

| Endpoint | Auth Required |
|----------|---------------|
| GET /api/hosts | Any authenticated user |
| GET /api/hosts/{id} | Any authenticated user |
| PATCH /api/hosts/{id} | Admin only |
| GET /api/hosts/{id}/ports | Any authenticated user |
| GET /api/hosts/export/csv | Any authenticated user |
| GET /api/hosts/export/pdf | Any authenticated user |

---

## List Hosts

Retrieves a paginated list of discovered hosts with optional filtering and sorting.

```
GET /api/hosts
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `network_id` | integer | No | - | Filter hosts by network ID (hosts seen by this network) |
| `is_pingable` | boolean | No | - | Filter by ping status (`true`=up, `false`=down, omit for all) |
| `ip_range` | string | No | - | Filter by IP range (CIDR or explicit range) |
| `ip_search` | string | No | - | Partial IP search (substring match) |
| `sort_by` | string | No | `last_seen_at` | Sort field: `ip`, `hostname`, `first_seen_at`, `last_seen_at` |
| `sort_dir` | string | No | `desc` | Sort direction: `asc`, `desc` |
| `offset` | integer | No | 0 | Number of records to skip |
| `limit` | integer | No | 50 | Maximum records to return (max: 10000) |

### IP Range Formats

The `ip_range` parameter supports two formats:

- **CIDR notation**: `192.168.1.0/24` or `2001:db8::/32`
- **Explicit range**: `192.168.1.10-192.168.1.50`

### Response

```json
{
  "hosts": [
    {
      "id": 1,
      "ip": "192.168.1.100",
      "hostname": "webserver-01",
      "is_pingable": true,
      "mac_address": "00:11:22:33:44:55",
      "mac_vendor": "Cisco Systems",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T14:30:00",
      "user_comment": "Production web server",
      "seen_by_networks": [1, 2],
      "open_port_count": 3
    }
  ],
  "total_count": 150,
  "pingable_count": 120
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique host identifier |
| `ip` | string | IP address (IPv4 or IPv6) |
| `hostname` | string\|null | Reverse DNS hostname |
| `is_pingable` | boolean\|null | Ping status: `true` (up), `false` (down), `null` (not tested) |
| `mac_address` | string\|null | MAC address (XX:XX:XX:XX:XX:XX format) |
| `mac_vendor` | string\|null | Vendor name from MAC address lookup |
| `first_seen_at` | datetime | When host was first discovered |
| `last_seen_at` | datetime | Most recent discovery timestamp |
| `user_comment` | string\|null | Admin annotation for the host |
| `seen_by_networks` | integer[] | Network IDs that have discovered this host |
| `open_port_count` | integer\|null | Number of open ports detected |
| `total_count` | integer | Total hosts matching filters |
| `pingable_count` | integer | Pingable hosts matching filters |

### Example Requests

```bash
# List all hosts
curl "http://localhost:8000/api/hosts" \
  -H "Authorization: Bearer <token>"

# Filter by network and ping status
curl "http://localhost:8000/api/hosts?network_id=1&is_pingable=true&limit=100" \
  -H "Authorization: Bearer <token>"

# Filter by IP range (CIDR)
curl "http://localhost:8000/api/hosts?ip_range=192.168.1.0/24" \
  -H "Authorization: Bearer <token>"

# Filter by IP range (explicit)
curl "http://localhost:8000/api/hosts?ip_range=192.168.1.10-192.168.1.50" \
  -H "Authorization: Bearer <token>"

# Partial IP search
curl "http://localhost:8000/api/hosts?ip_search=192.168" \
  -H "Authorization: Bearer <token>"

# Combine filters with sorting
curl "http://localhost:8000/api/hosts?network_id=1&sort_by=ip&sort_dir=asc&offset=0&limit=50" \
  -H "Authorization: Bearer <token>"
```

---

## Get Host Details

Retrieves details for a specific host.

```
GET /api/hosts/{host_id}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host_id` | integer | Yes | The host ID |

### Response

```json
{
  "id": 1,
  "ip": "192.168.1.100",
  "hostname": "webserver-01",
  "is_pingable": true,
  "mac_address": "00:11:22:33:44:55",
  "mac_vendor": "Cisco Systems",
  "first_seen_at": "2025-01-15T10:00:00",
  "last_seen_at": "2025-01-27T14:30:00",
  "user_comment": "Production web server",
  "seen_by_networks": [1, 2],
  "open_port_count": 3
}
```

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Host found and returned |
| 401 | Missing or invalid authentication |
| 404 | Host not found |

### Example Request

```bash
curl "http://localhost:8000/api/hosts/1" \
  -H "Authorization: Bearer <token>"
```

---

## Update Host

Updates host information. Currently only supports updating the user comment.

```
PATCH /api/hosts/{host_id}
```

**Requires admin authentication.**

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host_id` | integer | Yes | The host ID |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_comment` | string\|null | No | Comment or annotation (set to `null` to clear) |

### Example Request

```bash
curl -X PATCH "http://localhost:8000/api/hosts/1" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_comment": "Production web server - do not scan during business hours"
  }'
```

### Response

Returns the updated host object (same schema as Get Host Details).

### Status Codes

| Code | Description |
|------|-------------|
| 200 | Host updated successfully |
| 401 | Missing or invalid authentication |
| 403 | User is not an admin |
| 404 | Host not found |

---

## Get Host Open Ports

Retrieves the list of open ports discovered on a specific host.

```
GET /api/hosts/{host_id}/ports
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host_id` | integer | Yes | The host ID |

### Response

```json
{
  "ports": [
    {
      "id": 1,
      "ip": "192.168.1.100",
      "port": 80,
      "protocol": "tcp",
      "banner": "Apache/2.4.41",
      "service_guess": "http",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T14:30:00"
    },
    {
      "id": 2,
      "ip": "192.168.1.100",
      "port": 443,
      "protocol": "tcp",
      "banner": null,
      "service_guess": "https",
      "first_seen_at": "2025-01-15T10:00:00",
      "last_seen_at": "2025-01-27T14:30:00"
    }
  ]
}
```

### Port Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique port record identifier |
| `ip` | string | IP address of the host |
| `port` | integer | Port number |
| `protocol` | string | Protocol (`tcp` or `udp`) |
| `banner` | string\|null | Service banner grabbed during scan |
| `service_guess` | string\|null | Detected service name |
| `first_seen_at` | datetime | When port was first discovered open |
| `last_seen_at` | datetime | Most recent discovery timestamp |

### Example Request

```bash
curl "http://localhost:8000/api/hosts/1/ports" \
  -H "Authorization: Bearer <token>"
```

---

## Export Hosts as CSV

Exports host inventory data as a CSV file.

```
GET /api/hosts/export/csv
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network_id` | integer | No | Filter hosts by network ID |
| `status` | boolean | No | Filter by ping status |

### Response

Returns a CSV file with the following columns:

- IP
- Hostname
- Status (Up/Down/Unknown)
- OS Guess
- First Seen
- Last Seen
- Open Ports Count

**Content-Type:** `text/csv`
**Filename:** `hosts_YYYYMMdd_HHMMSS.csv`

### Example CSV Output

```csv
IP,Hostname,Status,OS Guess,First Seen,Last Seen,Open Ports Count
192.168.1.100,webserver-01,Up,,2025-01-15T10:00:00,2025-01-27T14:30:00,3
192.168.1.50,printer-02,Down,,2025-01-20T08:15:00,2025-01-26T16:45:00,0
192.168.1.200,,Unknown,,2025-01-25T12:00:00,2025-01-27T09:30:00,1
```

### Example Requests

```bash
# Export all hosts
curl "http://localhost:8000/api/hosts/export/csv" \
  -H "Authorization: Bearer <token>" \
  -o hosts.csv

# Export hosts from specific network
curl "http://localhost:8000/api/hosts/export/csv?network_id=1" \
  -H "Authorization: Bearer <token>" \
  -o hosts.csv

# Export only pingable (up) hosts
curl "http://localhost:8000/api/hosts/export/csv?status=true" \
  -H "Authorization: Bearer <token>" \
  -o hosts.csv
```

---

## Export Hosts as PDF

Exports a formatted PDF report of host inventory.

```
GET /api/hosts/export/pdf
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network_id` | integer | No | Filter hosts by network ID |
| `status` | boolean | No | Filter by ping status |

### Response

Returns a PDF document containing:

1. **Title:** "Host Inventory Report"
2. **Generation timestamp**
3. **Summary statistics:**
   - Total hosts count
   - Up count (pingable)
   - Down count (not pingable)
   - Unknown count (not tested)
4. **Detailed hosts table:** IP, Hostname, Status, First Seen, Last Seen, Open Ports

**Content-Type:** `application/pdf`
**Filename:** `hosts_YYYYMMdd_HHMMSS.pdf`

### Example Requests

```bash
# Export all hosts as PDF
curl "http://localhost:8000/api/hosts/export/pdf" \
  -H "Authorization: Bearer <token>" \
  -o hosts_report.pdf

# Export hosts from specific network
curl "http://localhost:8000/api/hosts/export/pdf?network_id=1" \
  -H "Authorization: Bearer <token>" \
  -o hosts_report.pdf
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
| 400 | Invalid IP range format | `Invalid ip_range; expected CIDR (e.g., 192.168.1.0/24) or range (e.g., 192.168.1.10-192.168.1.50)` |
| 400 | Invalid sort parameter | `Invalid sort_by value` or `Invalid sort_dir value` |
| 401 | Missing/invalid token | `Could not validate credentials` |
| 403 | Non-admin on admin endpoint | `Admin access required` |
| 404 | Host not found | `Host not found` |
