# Users API

The Users API provides endpoints for user management operations. All endpoints require **admin authentication**.

## Base URL

```
/api/users
```

## Authentication

All endpoints require admin-level JWT authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

Only users with the `admin` role can access these endpoints. Users with `viewer` role will receive a `403 Forbidden` response.

## User Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to all operations including user management |
| `viewer` | Read-only access to monitoring data |

## User Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Unique user identifier |
| `email` | string | User email address (unique) |
| `role` | string | User role: `admin` or `viewer` |
| `theme_preference` | string | UI theme: `light`, `dark`, or `system` |
| `created_at` | datetime | Account creation timestamp |
| `updated_at` | datetime | Last update timestamp |

---

## List Users

Retrieve a list of all users in the system.

**Endpoint:** `GET /api/users`

**Authentication:** Admin JWT required

### Response

```json
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com",
      "role": "admin",
      "theme_preference": "system",
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-20T14:22:00Z"
    },
    {
      "id": 2,
      "email": "viewer@example.com",
      "role": "viewer",
      "theme_preference": "dark",
      "created_at": "2025-01-18T09:00:00Z",
      "updated_at": "2025-01-18T09:00:00Z"
    }
  ]
}
```

### Example

```bash
curl -X GET "http://localhost:8000/api/users" \
  -H "Authorization: Bearer <admin_token>"
```

---

## Create User

Create a new user account.

**Endpoint:** `POST /api/users`

**Authentication:** Admin JWT required

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `email` | string | Yes | - | Valid email address (must be unique) |
| `password` | string | Yes | - | User password |
| `role` | string | No | `viewer` | User role: `admin` or `viewer` |

### Request Example

```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "role": "viewer"
}
```

### Response

**Status:** `201 Created`

```json
{
  "id": 3,
  "email": "newuser@example.com",
  "role": "viewer",
  "theme_preference": "system",
  "created_at": "2025-01-27T12:00:00Z",
  "updated_at": "2025-01-27T12:00:00Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Email already exists or invalid email format |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | User is not an admin |

### Example

```bash
curl -X POST "http://localhost:8000/api/users" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securePassword123",
    "role": "viewer"
  }'
```

---

## Get User

Retrieve details of a specific user by ID.

**Endpoint:** `GET /api/users/{user_id}`

**Authentication:** Admin JWT required

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | integer | User ID |

### Response

```json
{
  "id": 2,
  "email": "viewer@example.com",
  "role": "viewer",
  "theme_preference": "dark",
  "created_at": "2025-01-18T09:00:00Z",
  "updated_at": "2025-01-18T09:00:00Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `404 Not Found` | User not found |

### Example

```bash
curl -X GET "http://localhost:8000/api/users/2" \
  -H "Authorization: Bearer <admin_token>"
```

---

## Update User

Update an existing user's email, password, or role.

**Endpoint:** `PUT /api/users/{user_id}`

**Authentication:** Admin JWT required

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | integer | User ID |

### Request Body

All fields are optional. Only provided fields will be updated.

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | New email address (must be unique) |
| `password` | string | New password |
| `role` | string | New role: `admin` or `viewer` |

### Request Example

```json
{
  "role": "admin"
}
```

### Response

```json
{
  "id": 2,
  "email": "viewer@example.com",
  "role": "admin",
  "theme_preference": "dark",
  "created_at": "2025-01-18T09:00:00Z",
  "updated_at": "2025-01-27T15:30:00Z"
}
```

### Error Responses

| Status | Description |
|--------|-------------|
| `400 Bad Request` | Email already exists (when changing email) |
| `404 Not Found` | User not found |

### Example

```bash
curl -X PUT "http://localhost:8000/api/users/2" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

---

## Delete User

Delete a user account.

**Endpoint:** `DELETE /api/users/{user_id}`

**Authentication:** Admin JWT required

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | integer | User ID |

### Response

**Status:** `204 No Content`

No response body.

### Error Responses

| Status | Description |
|--------|-------------|
| `404 Not Found` | User not found |

### Example

```bash
curl -X DELETE "http://localhost:8000/api/users/3" \
  -H "Authorization: Bearer <admin_token>"
```

---

## Security Notes

- Passwords are hashed using PBKDF2-SHA256 before storage
- Email addresses must be unique across all users
- The `theme_preference` field is managed by the user through their profile settings, not through this API
- Deleting a user does not delete their associated data (comments, alert assignments, etc.)
