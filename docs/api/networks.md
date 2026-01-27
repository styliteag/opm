# Networks API

The Networks API allows you to manage network configurations for port scanning. Networks define the IP ranges to scan, port specifications, scan schedules, and associated scanners.

## Authentication

Most endpoints require **admin** authentication. Some read-only endpoints (scan history) are available to any authenticated user.

| Endpoint | Auth Required |
|----------|---------------|
| `GET /api/networks` | Admin |
| `POST /api/networks` | Admin |
| `GET /api/networks/{id}` | Admin |
| `PUT /api/networks/{id}` | Admin |
| `DELETE /api/networks/{id}` | Admin |
| `GET /api/networks/{id}/rules` | Admin |
| `POST /api/networks/{id}/rules` | Admin |
| `PUT /api/networks/{id}/rules` | Admin |
| `DELETE /api/networks/{id}/rules/{rule_id}` | Admin |
| `POST /api/networks/{id}/scan` | Admin |
| `GET /api/networks/{id}/scans` | User |
| `POST /api/networks/{id}/discover-hosts` | Admin |
| `GET /api/networks/{id}/host-discovery-scans` | User |

---

## Network CRUD Operations

### List Networks

```
GET /api/networks
```

Returns all configured networks.

**Response:**

```json
{
  "networks": [
    {
      "id": 1,
      "name": "Internal Network",
      "cidr": "192.168.1.0/24",
      "port_spec": "80-443,8080,!88",
      "scanner_id": 1,
      "scan_schedule": "0 * * * *",
      "scan_rate": 1000,
      "scan_timeout": 3600,
      "port_timeout": 1500,
      "scanner_type": "masscan",
      "scan_protocol": "tcp",
      "alert_config": null,
      "host_discovery_enabled": true,
      "is_ipv6": false,
      "created_at": "2024-01-27T10:00:00",
      "updated_at": "2024-01-27T10:00:00"
    }
  ]
}
```

**curl Example:**

```bash
curl -X GET "http://localhost:8000/api/networks" \
  -H "Authorization: Bearer <token>"
```

---

### Create Network

```
POST /api/networks
```

Creates a new network configuration.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique network name |
| `cidr` | string | Yes | Network CIDR notation (e.g., `192.168.1.0/24`) |
| `port_spec` | string | Yes | Port specification (see [Port Spec Format](#port-spec-format)) |
| `scanner_id` | integer | Yes | ID of scanner to use |
| `scan_schedule` | string | No | Cron expression for scheduled scans (null for manual only) |
| `scan_rate` | integer | No | Packets per second rate limit |
| `scan_timeout` | integer | No | Max scan duration in seconds (default: 3600) |
| `port_timeout` | integer | No | Port connection timeout in ms (default: 1500) |
| `scanner_type` | string | No | `masscan` or `nmap` (default: `masscan`) |
| `scan_protocol` | string | No | `tcp`, `udp`, or `both` (default: `tcp`) |
| `alert_config` | object | No | Custom alert configuration (JSON) |
| `host_discovery_enabled` | boolean | No | Enable host discovery (default: true) |

**Request Example:**

```json
{
  "name": "Office Network",
  "cidr": "10.0.0.0/16",
  "port_spec": "22,80,443,3389,8000-9000",
  "scanner_id": 1,
  "scan_schedule": "0 */2 * * *",
  "scan_rate": 500,
  "scanner_type": "masscan"
}
```

**Response:** `201 Created`

```json
{
  "id": 2,
  "name": "Office Network",
  "cidr": "10.0.0.0/16",
  "port_spec": "22,80,443,3389,8000-9000",
  "scanner_id": 1,
  "scan_schedule": "0 */2 * * *",
  "scan_rate": 500,
  "scan_timeout": 3600,
  "port_timeout": 1500,
  "scanner_type": "masscan",
  "scan_protocol": "tcp",
  "alert_config": null,
  "host_discovery_enabled": true,
  "is_ipv6": false,
  "created_at": "2024-01-27T10:00:00",
  "updated_at": "2024-01-27T10:00:00"
}
```

**curl Example:**

```bash
curl -X POST "http://localhost:8000/api/networks" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Office Network",
    "cidr": "10.0.0.0/16",
    "port_spec": "22,80,443,3389,8000-9000",
    "scanner_id": 1,
    "scan_schedule": "0 */2 * * *"
  }'
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| 400 | Scanner not found, network name exists, invalid CIDR/port_spec/cron |
| 401 | Missing or invalid token |
| 403 | User is not an admin |

---

### Get Network

```
GET /api/networks/{network_id}
```

Returns details for a specific network.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `network_id` | integer | Network ID |

**Response:** `200 OK`

Same structure as the network object in [List Networks](#list-networks).

**curl Example:**

```bash
curl -X GET "http://localhost:8000/api/networks/1" \
  -H "Authorization: Bearer <token>"
```

---

### Update Network

```
PUT /api/networks/{network_id}
```

Updates an existing network. All fields are optional (partial update supported).

**Request Body:**

Same fields as [Create Network](#create-network), but all are optional.

**Request Example:**

```json
{
  "scan_schedule": "0 * * * *",
  "scan_rate": 1000
}
```

**Response:** `200 OK`

Returns the updated network object.

**curl Example:**

```bash
curl -X PUT "http://localhost:8000/api/networks/1" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"scan_schedule": "0 * * * *"}'
```

---

### Delete Network

```
DELETE /api/networks/{network_id}
```

Deletes a network and all associated data (scans, port rules, alerts, host discovery scans).

**Response:** `204 No Content`

**curl Example:**

```bash
curl -X DELETE "http://localhost:8000/api/networks/1" \
  -H "Authorization: Bearer <token>"
```

---

## Port Rules

Port rules define which ports should generate alerts when found open (or be ignored).

### List Port Rules

```
GET /api/networks/{network_id}/rules
```

Returns all port rules for a network.

**Response:**

```json
{
  "rules": [
    {
      "id": 1,
      "network_id": 1,
      "ip": null,
      "port": "80",
      "rule_type": "allow",
      "description": "Allow HTTP traffic"
    },
    {
      "id": 2,
      "network_id": 1,
      "ip": "192.168.1.100",
      "port": "22",
      "rule_type": "block",
      "description": "Block SSH from specific host"
    }
  ]
}
```

**Rule Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Rule ID |
| `network_id` | integer | Parent network ID |
| `ip` | string | IP address (null for network-wide rules) |
| `port` | string | Port or port range (e.g., `80`, `80-443`, `*`) |
| `rule_type` | string | `allow` or `block` |
| `description` | string | Optional description |

**curl Example:**

```bash
curl -X GET "http://localhost:8000/api/networks/1/rules" \
  -H "Authorization: Bearer <token>"
```

---

### Create Port Rule

```
POST /api/networks/{network_id}/rules
```

Adds a port rule to a network.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ip` | string | No | IP address for host-specific rule (IPv4 or IPv6) |
| `port` | string | Yes | Port number, range, or `*` for all |
| `rule_type` | string | Yes | `allow` or `block` |
| `description` | string | No | Human-readable description |

**Request Example:**

```json
{
  "port": "443",
  "rule_type": "allow",
  "description": "Allow HTTPS on all hosts"
}
```

**Response:** `201 Created`

```json
{
  "id": 3,
  "network_id": 1,
  "ip": null,
  "port": "443",
  "rule_type": "allow",
  "description": "Allow HTTPS on all hosts"
}
```

**curl Example:**

```bash
curl -X POST "http://localhost:8000/api/networks/1/rules" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"port": "443", "rule_type": "allow", "description": "Allow HTTPS"}'
```

---

### Bulk Update Port Rules

```
PUT /api/networks/{network_id}/rules
```

Replaces **all** existing rules for a network with the provided array.

> **Warning:** This endpoint deletes all existing rules and replaces them with the provided set.

**Request Body:**

```json
{
  "rules": [
    {"port": "80", "rule_type": "allow", "description": "Allow HTTP"},
    {"port": "443", "rule_type": "allow", "description": "Allow HTTPS"},
    {"ip": "10.0.0.5", "port": "22", "rule_type": "block", "description": "Block SSH"}
  ]
}
```

**Response:** `200 OK`

```json
{
  "rules": [
    {"id": 10, "network_id": 1, "ip": null, "port": "80", "rule_type": "allow", "description": "Allow HTTP"},
    {"id": 11, "network_id": 1, "ip": null, "port": "443", "rule_type": "allow", "description": "Allow HTTPS"},
    {"id": 12, "network_id": 1, "ip": "10.0.0.5", "port": "22", "rule_type": "block", "description": "Block SSH"}
  ]
}
```

**curl Example:**

```bash
curl -X PUT "http://localhost:8000/api/networks/1/rules" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {"port": "80", "rule_type": "allow"},
      {"port": "443", "rule_type": "allow"}
    ]
  }'
```

---

### Delete Port Rule

```
DELETE /api/networks/{network_id}/rules/{rule_id}
```

Removes a specific port rule.

**Response:** `204 No Content`

**curl Example:**

```bash
curl -X DELETE "http://localhost:8000/api/networks/1/rules/3" \
  -H "Authorization: Bearer <token>"
```

---

## Scanning

### Trigger Manual Scan

```
POST /api/networks/{network_id}/scan
```

Starts a manual port scan for the network. Returns immediately; the scan runs asynchronously.

**Response:** `201 Created`

```json
{
  "scan_id": 42,
  "network_id": 1,
  "status": "planned",
  "trigger_type": "manual",
  "message": "Scan triggered successfully"
}
```

**curl Example:**

```bash
curl -X POST "http://localhost:8000/api/networks/1/scan" \
  -H "Authorization: Bearer <token>"
```

---

### Get Scan History

```
GET /api/networks/{network_id}/scans
```

Returns paginated scan history for a network. Available to any authenticated user.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Number of records to skip |
| `limit` | integer | 50 | Number of records to return (max: 200) |

**Response:**

```json
{
  "scans": [
    {
      "id": 42,
      "network_id": 1,
      "scanner_id": 1,
      "status": "completed",
      "started_at": "2024-01-27T10:05:00",
      "completed_at": "2024-01-27T10:15:00",
      "cancelled_at": null,
      "cancelled_by": null,
      "cancelled_by_email": null,
      "error_message": null,
      "trigger_type": "manual",
      "hidden": false,
      "progress_percent": 100.0,
      "progress_message": null,
      "port_count": 47
    }
  ]
}
```

**Scan Status Values:**

| Status | Description |
|--------|-------------|
| `planned` | Scan queued, waiting for scanner |
| `in_progress` | Scanner actively scanning |
| `completed` | Scan finished successfully |
| `cancelled` | Scan was cancelled |
| `failed` | Scan encountered an error |

**curl Example:**

```bash
curl -X GET "http://localhost:8000/api/networks/1/scans?limit=10" \
  -H "Authorization: Bearer <token>"
```

---

## Host Discovery

### Trigger Host Discovery

```
POST /api/networks/{network_id}/discover-hosts
```

Starts a host discovery scan to identify live hosts in the network. Requires `host_discovery_enabled: true` on the network.

**Response:** `201 Created`

```json
{
  "scan_id": 88,
  "message": "Host discovery scan scheduled"
}
```

**Error Responses:**

| Status | Reason |
|--------|--------|
| 400 | Host discovery is disabled for this network |
| 404 | Network not found |

**curl Example:**

```bash
curl -X POST "http://localhost:8000/api/networks/1/discover-hosts" \
  -H "Authorization: Bearer <token>"
```

---

### Get Host Discovery History

```
GET /api/networks/{network_id}/host-discovery-scans
```

Returns paginated host discovery scan history. Available to any authenticated user.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Number of records to skip |
| `limit` | integer | 50 | Number of records to return (max: 200) |

**Response:**

```json
{
  "scans": [
    {
      "id": 88,
      "network_id": 1,
      "scanner_id": 1,
      "status": "completed",
      "trigger_type": "manual",
      "started_at": "2024-01-27T10:20:00",
      "completed_at": "2024-01-27T10:22:00",
      "hosts_discovered": 23,
      "error_message": null
    }
  ]
}
```

**curl Example:**

```bash
curl -X GET "http://localhost:8000/api/networks/1/host-discovery-scans?limit=5" \
  -H "Authorization: Bearer <token>"
```

---

## Validation Rules

### Port Spec Format

The `port_spec` field supports flexible port specification:

| Format | Example | Description |
|--------|---------|-------------|
| Single port | `80` | Single port number |
| Port range | `80-443` | Inclusive port range |
| Exclusion | `!88` | Exclude specific port |
| Combined | `80-443,8080,!88` | Mix of ranges, singles, and exclusions |

- Port numbers must be between 1 and 65535
- Range start must not exceed range end
- At least one valid port must be specified

### CIDR Format

Networks support both IPv4 and IPv6 CIDR notation:

- IPv4: `192.168.1.0/24`, `10.0.0.0/8`
- IPv6: `2001:db8::/32`

### Cron Schedule Format

The `scan_schedule` field accepts standard cron expressions:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
│ │ │ │ │
* * * * *
```

**Examples:**

| Expression | Description |
|------------|-------------|
| `0 * * * *` | Every hour at minute 0 |
| `*/15 * * * *` | Every 15 minutes |
| `0 2 * * *` | Daily at 2:00 AM |
| `0 0 * * 0` | Weekly on Sunday at midnight |

Set to `null` for manual-only scanning.

### Port Rule Validation

- **port**: Single port (`80`), range (`80-443`), or wildcard (`*` or `ALL`)
- **ip**: Valid IPv4 or IPv6 address, or null for network-wide rules
- **rule_type**: Must be `allow` or `block`
