# Trends API

The Trends API provides historical data for analyzing security trends over time. Use these endpoints to build dashboards, reports, and visualizations showing how open ports, hosts, and alerts have changed.

All trends endpoints require user authentication (any role).

## Common Query Parameters

All trend endpoints share these query parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Start date for trend data (YYYY-MM-DD) |
| `end_date` | date | Yes | End date for trend data (YYYY-MM-DD) |
| `period` | string | No | Time period grouping: `day` (default), `week`, `month` |
| `network_id` | integer | No | Filter to a specific network (≥1) |

### Period Grouping

- **day**: Data points for each calendar day
- **week**: Data points for each week (Monday start, ISO week)
- **month**: Data points for each month (first day of month)

---

## GET /api/trends/open-ports

Get historical trend data for open ports discovered over time.

**Authentication:** User JWT (any role)

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Start date (YYYY-MM-DD) |
| `end_date` | date | Yes | End date (YYYY-MM-DD) |
| `period` | string | No | `day`, `week`, or `month` (default: `day`) |
| `network_id` | integer | No | Filter by network ID |

### Response

```json
{
  "data": [
    {
      "date": "2024-01-01",
      "count": 42
    },
    {
      "date": "2024-01-02",
      "count": 45
    },
    {
      "date": "2024-01-03",
      "count": 38
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of data points |
| `data[].date` | date | The period date (day start, week start Monday, or month first) |
| `data[].count` | integer | Count of unique ip:port combinations first seen in this period |

### Example

```bash
# Get daily open ports trend for January 2024
curl -X GET "http://localhost:8000/api/trends/open-ports?start_date=2024-01-01&end_date=2024-01-31&period=day" \
  -H "Authorization: Bearer <token>"
```

```bash
# Get weekly trend for a specific network
curl -X GET "http://localhost:8000/api/trends/open-ports?start_date=2024-01-01&end_date=2024-03-31&period=week&network_id=1" \
  -H "Authorization: Bearer <token>"
```

```bash
# Get monthly trend for the year
curl -X GET "http://localhost:8000/api/trends/open-ports?start_date=2024-01-01&end_date=2024-12-31&period=month" \
  -H "Authorization: Bearer <token>"
```

---

## GET /api/trends/hosts

Get historical trend data for hosts discovered over time.

**Authentication:** User JWT (any role)

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Start date (YYYY-MM-DD) |
| `end_date` | date | Yes | End date (YYYY-MM-DD) |
| `period` | string | No | `day`, `week`, or `month` (default: `day`) |
| `network_id` | integer | No | Filter by network ID (filters hosts seen by this network) |

### Response

```json
{
  "data": [
    {
      "date": "2024-01-01",
      "count": 10
    },
    {
      "date": "2024-01-02",
      "count": 15
    },
    {
      "date": "2024-01-03",
      "count": 8
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of data points |
| `data[].date` | date | The period date |
| `data[].count` | integer | Count of hosts first seen in this period |

### Example

```bash
# Get daily hosts discovery trend
curl -X GET "http://localhost:8000/api/trends/hosts?start_date=2024-01-01&end_date=2024-01-31&period=day" \
  -H "Authorization: Bearer <token>"
```

```bash
# Get monthly trend for a specific network
curl -X GET "http://localhost:8000/api/trends/hosts?start_date=2024-01-01&end_date=2024-12-31&period=month&network_id=2" \
  -H "Authorization: Bearer <token>"
```

---

## GET /api/trends/alerts

Get historical trend data for alerts generated over time, including acknowledgment status.

**Authentication:** User JWT (any role)

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Start date (YYYY-MM-DD) |
| `end_date` | date | Yes | End date (YYYY-MM-DD) |
| `period` | string | No | `day`, `week`, or `month` (default: `day`) |
| `network_id` | integer | No | Filter by network ID |
| `alert_type` | string | No | Filter by alert type: `new_port`, `not_allowed`, `blocked` |

### Alert Types

| Type | Description |
|------|-------------|
| `new_port` | A new port was discovered on a host |
| `not_allowed` | A port was found that is not in the allowed port rules |
| `blocked` | A port was found that is explicitly blocked by rules |

### Response

```json
{
  "data": [
    {
      "date": "2024-01-01",
      "count": 25,
      "acknowledged_count": 20
    },
    {
      "date": "2024-01-02",
      "count": 18,
      "acknowledged_count": 15
    },
    {
      "date": "2024-01-03",
      "count": 30,
      "acknowledged_count": 10
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | List of data points |
| `data[].date` | date | The period date |
| `data[].count` | integer | Total count of alerts created in this period |
| `data[].acknowledged_count` | integer | Count of acknowledged alerts in this period |

### Example

```bash
# Get daily alerts trend
curl -X GET "http://localhost:8000/api/trends/alerts?start_date=2024-01-01&end_date=2024-01-31&period=day" \
  -H "Authorization: Bearer <token>"
```

```bash
# Get weekly trend for new_port alerts only
curl -X GET "http://localhost:8000/api/trends/alerts?start_date=2024-01-01&end_date=2024-03-31&period=week&alert_type=new_port" \
  -H "Authorization: Bearer <token>"
```

```bash
# Get monthly trend for a specific network, not_allowed alerts
curl -X GET "http://localhost:8000/api/trends/alerts?start_date=2024-01-01&end_date=2024-12-31&period=month&network_id=1&alert_type=not_allowed" \
  -H "Authorization: Bearer <token>"
```

---

## Error Responses

### 400 Bad Request

Returned when query parameters are invalid.

```json
{
  "detail": "start_date must be before end_date"
}
```

### 401 Unauthorized

Returned when the JWT token is missing or invalid.

```json
{
  "detail": "Not authenticated"
}
```

---

## Usage Tips

1. **Choose appropriate periods**: Use `day` for short ranges (up to a month), `week` for medium ranges (1-6 months), and `month` for longer ranges (6+ months) to keep response sizes manageable.

2. **Filter by network**: When monitoring multiple networks, filter by `network_id` to get trends for specific segments of your infrastructure.

3. **Compare trends**: The alerts endpoint includes `acknowledged_count` which lets you track your team's response rate over time. A growing gap between `count` and `acknowledged_count` may indicate alert fatigue.

4. **Empty periods**: Periods with zero counts may not appear in the response. Handle missing dates in your visualization code.
