# Global Ports API

The Global Ports API provides endpoints for viewing deduplicated open ports across all scans and managing global port rules (allow/block policies).

## Overview

There are two related APIs:

1. **Global Open Ports** (`/api/global-ports`) - Query deduplicated open ports discovered across all networks and scans
2. **Policy Rules** (`/api/policy`) - Manage global and network-specific port rules (allow/block)

---

# Global Open Ports

## Base URL

```
/api/global-ports
```

## Authentication

Requires user authentication (admin or viewer role) via the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## List Global Open Ports

Retrieve a deduplicated list of open ports discovered across all scans. Each entry represents a unique IP:port:protocol combination, with metadata about when it was first and last seen.

**Endpoint:** `GET /api/global-ports`

**Authentication:** User JWT required (admin or viewer)

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `port_min` | integer | - | Minimum port number (1-65535) |
| `port_max` | integer | - | Maximum port number (1-65535) |
| `ip_range` | string | - | Filter by IP range (CIDR or range format) |
| `service` | string | - | Filter by service name |
| `sort_by` | string | `last_seen_at` | Sort field |
| `sort_dir` | string | `desc` | Sort direction: `asc` or `desc` |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `50` | Results per page (max: 10000) |

### IP Range Formats

- **CIDR notation:** `192.168.1.0/24`
- **Explicit range:** `192.168.1.10-192.168.1.50`

### Response

```json
{
  "ports": [
    {
      "id": 1,
      "ip": "192.168.1.100",
      "port": 22,
      "protocol": "tcp",
      "banner": "SSH-2.0-OpenSSH_8.9p1",
      "service_guess": "ssh",
      "mac_address": "00:1A:2B:3C:4D:5E",
      "mac_vendor": "Cisco Systems",
      "first_seen_at": "2025-01-15T10:30:00Z",
      "last_seen_at": "2025-01-27T08:00:00Z",
      "seen_by_networks": [1, 3]
    },
    {
      "id": 2,
      "ip": "192.168.1.101",
      "port": 80,
      "protocol": "tcp",
      "banner": null,
      "service_guess": "http",
      "mac_address": null,
      "mac_vendor": null,
      "first_seen_at": "2025-01-20T14:00:00Z",
      "last_seen_at": "2025-01-27T08:00:00Z",
      "seen_by_networks": [1]
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique identifier for this global port entry |
| `ip` | string | IP address where the port was discovered |
| `port` | integer | Port number |
| `protocol` | string | Protocol: `tcp` or `udp` |
| `banner` | string | Banner/service response (if available) |
| `service_guess` | string | Service name detected by nmap (if available) |
| `mac_address` | string | MAC address (if discovered) |
| `mac_vendor` | string | MAC vendor name (if known) |
| `first_seen_at` | datetime | When this port was first discovered |
| `last_seen_at` | datetime | When this port was last seen open |
| `seen_by_networks` | array | List of network IDs that have seen this port |

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid query parameters (e.g., port_min > port_max, invalid IP range) |

### Example

```bash
# List all global open ports
curl -X GET "http://localhost:8000/api/global-ports" \
  -H "Authorization: Bearer <token>"

# Filter by port range and IP subnet
curl -X GET "http://localhost:8000/api/global-ports?port_min=1&port_max=1024&ip_range=192.168.1.0/24" \
  -H "Authorization: Bearer <token>"

# Filter by service
curl -X GET "http://localhost:8000/api/global-ports?service=ssh&sort_by=ip&sort_dir=asc" \
  -H "Authorization: Bearer <token>"
```

---

## Get Global Open Port

Retrieve details of a specific global open port entry by ID.

**Endpoint:** `GET /api/global-ports/{port_id}`

**Authentication:** User JWT required (admin or viewer)

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `port_id` | integer | Global open port ID |

### Response

```json
{
  "id": 1,
  "ip": "192.168.1.100",
  "port": 22,
  "protocol": "tcp",
  "banner": "SSH-2.0-OpenSSH_8.9p1",
  "service_guess": "ssh",
  "mac_address": "00:1A:2B:3C:4D:5E",
  "mac_vendor": "Cisco Systems",
  "first_seen_at": "2025-01-15T10:30:00Z",
  "last_seen_at": "2025-01-27T08:00:00Z",
  "seen_by_networks": [1, 3]
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `404 Not Found` | Global open port not found |

### Example

```bash
curl -X GET "http://localhost:8000/api/global-ports/1" \
  -H "Authorization: Bearer <token>"
```

---

# Policy Rules API

The Policy API provides a unified interface for managing both global port rules and network-specific port rules.

## Base URL

```
/api/policy
```

## Rule Types

| Type | Description |
|------|-------------|
| `allow` | Port is whitelisted - no alerts generated |
| `block` | Port is blacklisted - always generates alerts |

## Rule Scope

- **Global rules:** Apply to all networks (`network_id: null`)
- **Network rules:** Apply to a specific network only

---

## List Policy Rules

Retrieve all policy rules (global and network-specific).

**Endpoint:** `GET /api/policy`

**Authentication:** User JWT required (admin or viewer)

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `network_id` | integer | Filter to show only rules for this network (plus global rules) |

### Response

Rules are sorted: global rules first, then by network name, then by port.

```json
{
  "rules": [
    {
      "id": 1,
      "network_id": null,
      "network_name": "Global",
      "ip": null,
      "port": "22",
      "rule_type": "allow",
      "description": "Allow SSH globally",
      "created_at": "2025-01-15T10:00:00Z",
      "created_by": 1
    },
    {
      "id": 5,
      "network_id": null,
      "network_name": "Global",
      "ip": "192.168.1.100",
      "port": "8080",
      "rule_type": "allow",
      "description": "Allow web server on specific host",
      "created_at": "2025-01-20T14:00:00Z",
      "created_by": 1
    },
    {
      "id": 10,
      "network_id": 1,
      "network_name": "Production Network",
      "ip": null,
      "port": "443",
      "rule_type": "allow",
      "description": "Allow HTTPS on production",
      "created_at": null,
      "created_by": null
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Rule ID (unique per scope) |
| `network_id` | integer | Network ID (null for global rules) |
| `network_name` | string | Network name or "Global" |
| `ip` | string | IP address this rule applies to (null = all IPs) |
| `port` | string | Port or port range (e.g., "80" or "80-443") |
| `rule_type` | string | `allow` or `block` |
| `description` | string | Rule description |
| `created_at` | datetime | When the rule was created (global rules only) |
| `created_by` | integer | User ID who created the rule (global rules only) |

### Example

```bash
# List all rules
curl -X GET "http://localhost:8000/api/policy" \
  -H "Authorization: Bearer <token>"

# List rules for a specific network
curl -X GET "http://localhost:8000/api/policy?network_id=1" \
  -H "Authorization: Bearer <token>"
```

---

## Create Policy Rule

Create a new global or network-specific port rule.

**Endpoint:** `POST /api/policy`

**Authentication:** Admin JWT required

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `network_id` | integer | No | `null` | Network ID (null = global rule) |
| `ip` | string | No | `null` | IP address to apply rule to (null = all IPs) |
| `port` | string | Yes | - | Port or port range (e.g., "80" or "80-443") |
| `rule_type` | string | No | `allow` | Rule type: `allow` or `block` |
| `description` | string | No | "Manual rule" | Rule description |

### Port Format

- Single port: `"80"`
- Port range: `"80-443"`

### Request Example (Global Rule)

```json
{
  "port": "22",
  "rule_type": "allow",
  "description": "Allow SSH globally"
}
```

### Request Example (Network Rule)

```json
{
  "network_id": 1,
  "ip": "192.168.1.100",
  "port": "8080-8090",
  "rule_type": "allow",
  "description": "Allow dev server ports on web host"
}
```

### Response

**Status:** `201 Created`

```json
{
  "id": 15,
  "network_id": null,
  "network_name": "Global",
  "ip": null,
  "port": "22",
  "rule_type": "allow",
  "description": "Allow SSH globally",
  "created_at": "2025-01-27T12:00:00Z",
  "created_by": 1
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid port format or IP address |
| `404 Not Found` | Network not found (when creating network rule) |

### Example

```bash
# Create a global allow rule
curl -X POST "http://localhost:8000/api/policy" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "port": "22",
    "rule_type": "allow",
    "description": "Allow SSH globally"
  }'

# Create a network-specific block rule
curl -X POST "http://localhost:8000/api/policy" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "network_id": 1,
    "port": "23",
    "rule_type": "block",
    "description": "Block telnet"
  }'
```

---

## Update Policy Rule

Update an existing policy rule.

**Endpoint:** `PATCH /api/policy/{scope}/{rule_id}`

**Authentication:** Admin JWT required

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | string | `global` or `network` |
| `rule_id` | integer | Rule ID |

### Request Body

All fields are optional. Only provided fields will be updated.

| Field | Type | Description |
|-------|------|-------------|
| `ip` | string | IP address (empty string or null to clear) |
| `port` | string | Port or port range |
| `rule_type` | string | `allow` or `block` |
| `description` | string | Rule description |

### Request Example

```json
{
  "description": "Updated description",
  "rule_type": "block"
}
```

### Response

```json
{
  "id": 15,
  "network_id": null,
  "network_name": "Global",
  "ip": null,
  "port": "22",
  "rule_type": "block",
  "description": "Updated description",
  "created_at": "2025-01-27T12:00:00Z",
  "created_by": 1
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid scope or port/IP format |
| `404 Not Found` | Rule not found |

### Example

```bash
# Update a global rule
curl -X PATCH "http://localhost:8000/api/policy/global/15" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Block SSH - security policy change"
  }'

# Update a network rule
curl -X PATCH "http://localhost:8000/api/policy/network/10" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "port": "443-8443",
    "rule_type": "allow"
  }'
```

---

## Delete Policy Rule

Delete a policy rule.

**Endpoint:** `DELETE /api/policy/{scope}/{rule_id}`

**Authentication:** Admin JWT required

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `scope` | string | `global` or `network` |
| `rule_id` | integer | Rule ID |

### Response

**Status:** `204 No Content`

No response body.

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Invalid scope |
| `404 Not Found` | Rule not found |

### Example

```bash
# Delete a global rule
curl -X DELETE "http://localhost:8000/api/policy/global/15" \
  -H "Authorization: Bearer <admin_token>"

# Delete a network rule
curl -X DELETE "http://localhost:8000/api/policy/network/10" \
  -H "Authorization: Bearer <admin_token>"
```

---

## How Rules Affect Alerts

When a port is discovered during a scan:

1. **Global allow rules** are checked first - if matched, no alert is generated
2. **Network-specific allow rules** are checked - if matched, no alert is generated
3. **Block rules** (global or network) - if matched, an alert is always generated
4. If no rule matches, the default behavior depends on the network's port specification

Rules can be IP-specific (apply only to a particular host) or apply to all IPs in scope.

## Related Endpoints

- [Alerts API](./alerts.md) - View and manage alerts generated by policy violations
- [Networks API](./networks.md) - Manage network-specific port rules via `/api/networks/{id}/rules`
