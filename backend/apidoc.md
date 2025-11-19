# UselessMonitor API Documentation

## Authentication

Every request must include an `Authorization` header containing either the configured `READ_KEY` or `ADMIN_KEY`.

- `READ_KEY` can view monitors and global status.
- `ADMIN_KEY` can view, create, update, and delete monitors.

## Monitor Endpoints

### `GET /monitor`

Return every monitor along with the last HTTP probe results.

**Headers**
- `Authorization` (string, required): `READ_KEY` or `ADMIN_KEY`.

**Success Response** (`200 OK`)
```json
[
  {
    "id": 1,
    "name": "API Health Check",
    "type": "API",
    "url": "https://status.example.com/health",
    "status": "HEALTHY",
    "last_check": "2024-06-01T12:00:00Z",
    "last_response_code": 200,
    "last_response_time_ms": 123
  }
]
```

**Error Responses**
- `401 Unauthorized` when the header is missing.
- `403 Forbidden` when the key does not match.

**Example**
```bash
curl -H "Authorization: $READ_KEY" http://localhost:8080/monitor
```

---

### `POST /monitor`

Create a new monitor. The backend automatically performs the first HTTP probe after creation.

**Headers**
- `Authorization` (string, required): `ADMIN_KEY`.
- `Content-Type: application/json`

**Request Body**
```json
{
  "name": "API Health Check",
  "type": "API",
  "url": "https://status.example.com/health"
}
```

**Success Response** (`201 Created`)
```json
{
  "id": 1,
  "name": "API Health Check",
  "type": "API",
  "url": "https://status.example.com/health",
  "status": "UNKNOWN",
  "last_check": "0001-01-01T00:00:00Z",
  "last_response_code": 0,
  "last_response_time_ms": 0
}
```

**Error Responses**
- `400 Bad Request` when the payload is invalid or the URL cannot be parsed.
- `401 Unauthorized` when the header is missing.
- `403 Forbidden` when the key does not match the admin key.
- `500 Internal Server Error` when persistence fails.

**Example**
```bash
curl -X POST \
  -H "Authorization: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "API Health Check", "type": "API", "url": "https://status.example.com/health"}' \
  http://localhost:8080/monitor
```

---

### `PUT /monitor/:id`

Update monitor metadata (name, type, or URL). A fresh HTTP probe is queued automatically.

**Headers**
- `Authorization` (string, required): `ADMIN_KEY`.
- `Content-Type: application/json`

**Request Body**
Provide any subset of the editable fields:
```json
{
  "name": "API V2",
  "type": "EDGE",
  "url": "https://edge.example.com/health"
}
```

**Success Response** (`200 OK`)
```json
{
  "id": 1,
  "name": "API V2",
  "type": "EDGE",
  "url": "https://edge.example.com/health",
  "status": "UNKNOWN",
  "last_check": "2024-06-01T12:05:00Z",
  "last_response_code": 200,
  "last_response_time_ms": 110
}
```

**Error Responses**
- `400 Bad Request` when the payload is invalid.
- `401 Unauthorized` when the header is missing.
- `403 Forbidden` when the key does not match the admin key.
- `404 Not Found` when the monitor does not exist.
- `500 Internal Server Error` when persistence fails.

**Example**
```bash
curl -X PUT \
  -H "Authorization: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://edge.example.com/health"}' \
  http://localhost:8080/monitor/1
```

---

### `DELETE /monitor/:id`

Remove a monitor entry.

**Headers**
- `Authorization` (string, required): `ADMIN_KEY`.

**Success Response** (`200 OK`)
```json
{"message": "Monitor deleted"}
```

**Error Responses**
- `401 Unauthorized` when the header is missing.
- `403 Forbidden` when the key does not match the admin key.
- `500 Internal Server Error` when deletion fails.

**Example**
```bash
curl -X DELETE -H "Authorization: $ADMIN_KEY" http://localhost:8080/monitor/1
```

---

## Status Endpoint

### `GET /status`

Summarize the global health across every monitor.

**Headers**
- `Authorization` (string, required): `READ_KEY` or `ADMIN_KEY`.

**Success Response** (`200 OK`)
```json
{
  "status": "DEGRADED",
  "monitors": 3,
  "healthy_monitors": 2
}
```

**Error Responses**
- `401 Unauthorized` when the header is missing.
- `403 Forbidden` when the key does not match.
- `500 Internal Server Error` when the summary cannot be generated.

**Example**
```bash
curl -H "Authorization: $READ_KEY" http://localhost:8080/status
```
