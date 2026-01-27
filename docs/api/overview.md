# API Overview

This document covers the common patterns, authentication, error handling, and conventions used across all Open Port Monitor API endpoints.

## Base URL

All API endpoints are prefixed with `/api`. For example:
- Authentication: `/api/auth/login`
- Networks: `/api/networks`
- Alerts: `/api/alerts`

The base URL depends on your deployment (e.g., `http://localhost:8000` for development).

## Authentication

Most API endpoints require authentication via JWT (JSON Web Token) in the `Authorization` header.

### Header Format

```
Authorization: Bearer <token>
```

### Obtaining a Token

To obtain a token, authenticate via the login endpoint:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### Making Authenticated Requests

Include the token in subsequent requests:

```bash
curl http://localhost:8000/api/networks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Expiration

JWT tokens have an expiration time configured by the server. When a token expires, you'll receive a `401 Unauthorized` response and need to re-authenticate.

### Role-Based Access

The API has two user roles:
- **admin**: Full access to all endpoints including user management and configuration
- **viewer**: Read-only access to monitoring and reporting endpoints

Some endpoints are restricted to admin users only. Attempting to access admin-only endpoints with a viewer account returns `403 Forbidden`.

## HTTP Status Codes

The API uses standard HTTP status codes to indicate success or failure:

| Status Code | Description |
|-------------|-------------|
| `200 OK` | Request succeeded. Response body contains the requested data. |
| `201 Created` | Resource successfully created. Response body contains the new resource. |
| `204 No Content` | Request succeeded with no response body (typically for DELETE operations). |
| `400 Bad Request` | Invalid request. Check the error message for details. |
| `401 Unauthorized` | Missing or invalid authentication token. |
| `403 Forbidden` | Authenticated but lacking permission (e.g., viewer accessing admin endpoint). |
| `404 Not Found` | The requested resource does not exist. |
| `500 Internal Server Error` | Server-side error. Contact administrator if persistent. |

## Error Response Format

All error responses follow a consistent JSON format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common Error Examples

**Invalid credentials (401):**
```json
{
  "detail": "Incorrect email or password"
}
```

**Invalid or expired token (401):**
```json
{
  "detail": "Could not validate credentials"
}
```

**Insufficient permissions (403):**
```json
{
  "detail": "Admin access required"
}
```

**Resource not found (404):**
```json
{
  "detail": "Network not found"
}
```

**Duplicate resource (400):**
```json
{
  "detail": "A network with this name already exists"
}
```

**Validation error (400):**
```json
{
  "detail": "port_min cannot be greater than port_max"
}
```

**Invalid IP range format (400):**
```json
{
  "detail": "Invalid ip_range; expected CIDR (e.g., 192.168.1.0/24) or range (e.g., 192.168.1.10-192.168.1.50)"
}
```

## Pagination

List endpoints support offset/limit pagination using query parameters.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | `0` | Number of records to skip (minimum: 0) |
| `limit` | integer | `50` | Maximum records to return (minimum: 1) |

The maximum `limit` varies by endpoint:
- Hosts and Ports: up to 10,000
- Alerts and Scans: up to 200

### Example Request

```bash
# Get the second page of 25 alerts
curl "http://localhost:8000/api/alerts?offset=25&limit=25" \
  -H "Authorization: Bearer <token>"
```

### Example Response

```json
{
  "alerts": [
    {
      "id": 26,
      "type": "new_port",
      "ip": "192.168.1.50",
      "port": 8080,
      "severity": "high",
      "acknowledged": false,
      "created_at": "2025-01-27T14:20:00Z"
    }
  ],
  "total_count": 150
}
```

Note: Not all list endpoints include `total_count`. Check individual endpoint documentation.

### Pagination Patterns

To iterate through all records:

```bash
# First page
curl "http://localhost:8000/api/hosts?offset=0&limit=100" -H "Authorization: Bearer <token>"

# Second page
curl "http://localhost:8000/api/hosts?offset=100&limit=100" -H "Authorization: Bearer <token>"

# Continue until fewer results than limit are returned
```

## Filtering

Many list endpoints support filtering via query parameters. Common patterns include:

### Filter by Related Resource

```bash
# Get alerts for a specific network
curl "http://localhost:8000/api/alerts?network_id=1" \
  -H "Authorization: Bearer <token>"
```

### Filter by Status

```bash
# Get only unacknowledged alerts
curl "http://localhost:8000/api/alerts?acknowledged=false" \
  -H "Authorization: Bearer <token>"
```

### Filter by Date Range

Date parameters use ISO 8601 format:

```bash
# Get alerts from the last 24 hours
curl "http://localhost:8000/api/alerts?start_date=2025-01-26T00:00:00Z&end_date=2025-01-27T00:00:00Z" \
  -H "Authorization: Bearer <token>"
```

### Filter by IP Range

IP ranges can be specified as CIDR notation or explicit ranges:

```bash
# CIDR notation
curl "http://localhost:8000/api/hosts?ip_range=192.168.1.0/24" \
  -H "Authorization: Bearer <token>"

# Explicit range
curl "http://localhost:8000/api/hosts?ip_range=192.168.1.10-192.168.1.50" \
  -H "Authorization: Bearer <token>"
```

### Sorting

Some endpoints support sorting:

```bash
# Sort hosts by IP address ascending
curl "http://localhost:8000/api/hosts?sort_by=ip&sort_dir=asc" \
  -H "Authorization: Bearer <token>"

# Sort hosts by last seen date descending (default)
curl "http://localhost:8000/api/hosts?sort_by=last_seen_at&sort_dir=desc" \
  -H "Authorization: Bearer <token>"
```

### Combining Filters

Multiple filters can be combined:

```bash
curl "http://localhost:8000/api/alerts?network_id=1&type=new_port&acknowledged=false&offset=0&limit=50" \
  -H "Authorization: Bearer <token>"
```

## Request Content Types

For endpoints that accept a request body (POST, PUT, PATCH), use JSON format:

```bash
curl -X POST http://localhost:8000/api/networks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Network",
    "ip_range": "10.0.0.0/8"
  }'
```

## API Endpoints Overview

| Category | Base Path | Description |
|----------|-----------|-------------|
| [Authentication](authentication.md) | `/api/auth` | User login, token management |
| [Networks](networks.md) | `/api/networks` | Network CRUD, rules, scanning |
| [Alerts](alerts.md) | `/api/alerts` | Alert management, acknowledgment |
| [Hosts](hosts.md) | `/api/hosts` | Host inventory |
| [Scans](scans.md) | `/api/scans` | Scan results and logs |
| [Trends](trends.md) | `/api/trends` | Historical analytics |
| [Scanner API](scanner-api.md) | `/api/scanner` | Scanner agent communication |
| [Users](users.md) | `/api/users` | User management (admin) |
| [Global Ports](global-ports.md) | `/api/global_ports` | Global port rules |

## Health Check

A health check endpoint is available without authentication:

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy"
}
```
