# UselessMonitor Backend

A lightweight Gin + SQLite API that stores monitor definitions and actively polls their HTTP endpoints. Each monitor stores the
last response code, latency, and derived status so the frontend never has to toggle states manually.

## Environment Variables

| Name                    | Required | Description |
| ----------------------- | -------- | ----------- |
| `READ_KEY`              | Yes      | Key that can read `/monitor` and `/status`. |
| `ADMIN_KEY`             | Yes      | Key that can create/update/delete monitors. |
| `CHECK_INTERVAL_SECONDS` | No       | How often to poll every monitor (default `30`). |

Store them in `.env` or export them in your shell before running the service.

## Running Locally

```bash
cd backend
export READ_KEY=example-read-key
export ADMIN_KEY=example-admin-key
# optional
export CHECK_INTERVAL_SECONDS=15

# install dependencies and run
GOTOOLCHAIN=local go mod tidy
go run .
```

The API listens on port `8080` by default.

## API Overview

All requests must include an `Authorization` header containing the read or admin key.

- `GET /monitor` — list monitors with their URL, last response metrics, and derived status (read key allowed).
- `POST /monitor` — create a monitor (`name`, `type`, `url` fields) and immediately trigger an HTTP check (admin key required).
- `PUT /monitor/:id` — update monitor metadata (`name`, `type`, `url`) and re-run the HTTP check (admin key required).
- `DELETE /monitor/:id` — remove a monitor (admin key required).
- `GET /status` — summarize global health (read key allowed).

Detailed request/response examples live in [`apidoc.md`](apidoc.md).
