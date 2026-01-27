# Authentication

The Open Port Monitor API uses JWT (JSON Web Tokens) for authentication. There are two authentication flows:

1. **User Authentication** - For human users accessing the web interface and API
2. **Scanner Authentication** - For scanner agents reporting scan results

## User Authentication

### POST /api/auth/login

Authenticate a user with email and password to receive a JWT token.

**Authentication Required:** None

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email address |
| `password` | string | Yes | User's password |

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

**Response (200 OK):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid email or password |

### POST /api/auth/refresh

> **Note:** The API currently does not have a dedicated refresh endpoint. User tokens expire after 60 minutes and users must re-authenticate.

### GET /api/auth/me

Get the current authenticated user's information.

**Authentication Required:** User JWT

**Example Request:**

```bash
curl -X GET "http://localhost:8000/api/auth/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**

```json
{
  "id": 1,
  "email": "admin@example.com",
  "role": "admin",
  "theme_preference": "system"
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid or missing token |

### POST /api/auth/logout

Logout the current user. Since JWTs are stateless, this endpoint exists for API completeness. Token invalidation is handled client-side by discarding the token.

**Authentication Required:** User JWT

**Example Request:**

```bash
curl -X POST "http://localhost:8000/api/auth/logout" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:** `204 No Content`

## Scanner Authentication

Scanner agents authenticate using an API key to receive a short-lived JWT token.

### Authentication Flow

1. Admin creates a scanner in the web UI, receiving a one-time API key
2. Scanner agent stores the API key securely
3. Scanner calls `POST /api/scanner/auth` with the API key in the `X-Api-Key` header
4. Backend validates the API key and returns a short-lived JWT (15 minutes)
5. Scanner uses the JWT for subsequent API calls
6. Scanner re-authenticates before token expires to maintain access

### POST /api/scanner/auth

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
  -d '{
    "scanner_version": "1.2.0"
  }'
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

**Error Responses:**

| Status | Description |
|--------|-------------|
| 401 | Invalid API key |
| 429 | Rate limit exceeded (10 attempts per minute per IP) |

**Rate Limiting:**

- **Limit:** 10 authentication attempts per minute
- **Window:** 60 seconds sliding window
- **Per-IP:** Tracked by `X-Forwarded-For`, `X-Real-IP`, or direct client IP

## JWT Token Structure

### User Token Payload

```json
{
  "sub": "1",
  "email": "admin@example.com",
  "role": "admin",
  "exp": 1704067200
}
```

| Claim | Description |
|-------|-------------|
| `sub` | User ID (as string) |
| `email` | User's email address |
| `role` | User role: `admin` or `viewer` |
| `exp` | Expiration timestamp (Unix epoch) |

### Scanner Token Payload

```json
{
  "sub": "1",
  "scope": "scanner",
  "scanner_name": "office-scanner",
  "exp": 1704067200
}
```

| Claim | Description |
|-------|-------------|
| `sub` | Scanner ID (as string) |
| `scope` | Always `"scanner"` for scanner tokens |
| `scanner_name` | Name of the scanner |
| `exp` | Expiration timestamp (Unix epoch) |

## Token Expiration

| Token Type | Expiration |
|------------|------------|
| User Token | 60 minutes |
| Scanner Token | 15 minutes |

User token expiration is configurable via the `JWT_EXPIRATION_MINUTES` environment variable. Scanner tokens have a fixed 15-minute expiration to minimize risk if a token is compromised.

## Using Authentication in API Requests

All authenticated API requests require the JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Example Authenticated Request:**

```bash
curl -X GET "http://localhost:8000/api/networks" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## User Roles

The API supports two user roles:

| Role | Description |
|------|-------------|
| `admin` | Full access to all endpoints including user and scanner management |
| `viewer` | Read-only access to networks, hosts, alerts, and scan results |

Admin-only endpoints will return `403 Forbidden` for viewer users.

## Security Notes

- Passwords are hashed using PBKDF2-SHA256
- API keys are stored as hashed values and cannot be retrieved after initial creation
- JWT tokens are signed using HS256 algorithm
- Always use HTTPS in production to protect tokens and credentials in transit
- Store scanner API keys securely (environment variables, secrets manager)
