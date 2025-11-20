# Useless Monitor

A single repository that bundles the Gin/SQLite backend API together with the immersive Vite + React dashboard. The backend now
performs automated HTTP health checks for every monitor entry and the frontend consumes that live telemetry without any manual
status toggling.

## Repository Layout

```
UselessMonitor/
├── backend/   # Go + Gin API server
├── frontend/  # Vite + React single-page dashboard
└── README.md  # You are here
```

## Backend (Gin + SQLite)

* location: [`backend/`](backend)
* language: Go 1.21+
* features:
  * Key-based read/admin access using `READ_KEY` and `ADMIN_KEY` headers.
  * Monitor records include HTTP endpoint metadata and the last response metrics.
  * A background worker issues HTTP GET probes on a configurable interval (`CHECK_INTERVAL_SECONDS`, default 30s) and updates the
    monitor status (`HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNKNOWN`).
  * `GET /monitor` and `GET /status` are safe for read-only keys, while `POST/PUT/DELETE /monitor` require the admin key.

See [`backend/README.md`](backend/README.md) for environment variables and the complete API description.

## Frontend (Vite + React)

* location: [`frontend/`](frontend)
* language: TypeScript + React 19, built with Vite 6.
* features:
  * Real-time console that renders the backend monitor list, response codes, and last contact timestamp.
  * HTTP status is now fully automated — the UI can no longer toggle statuses manually.
  * Admin mode allows creating or editing monitors by providing the name, sector/type, and monitored URL; deletion is also
    available when the admin key is provided.
  * Bilingual UI (English/Chinese) and ambient sci-fi visual treatments.

Configuration instructions (copying `frontend/public/config.example.json` to `frontend/public/config.json`) and npm scripts live in
[`frontend/README.md`](frontend/README.md).

## Development Workflow

1. Start the backend API:
   ```bash
   cd backend
   go run .
   ```
2. Start the frontend dev server in a separate shell:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Update `frontend/public/config.json` so the dashboard knows which backend URL and read key to use.

Both services are intentionally lightweight so they can be deployed together or independently depending on your infrastructure.

## Bundled Release Binary

This repository intentionally keeps `backend/assets/statics` empty so the Git history never contains a stale React build. The
production workflow lives in [`.github/workflows/release.yml`](.github/workflows/release.yml), runs on every push, and publishes
release artifacts when a `v*` tag is present (or the workflow is manually dispatched):

1. Install frontend dependencies and run `npm run build` so the static bundle lands inside `backend/assets/statics/`.
2. Run `go test ./...` inside `backend/`.
3. Compile a Linux `amd64` binary with the freshly built frontend embedded and publish it as a GitHub Release asset.

To reproduce the same one-click binary locally:

```bash
cd frontend
npm install
npm run build  # emits into ../backend/assets/statics

cd ../backend
go build -o uselessmonitor
```

The resulting `uselessmonitor` executable already serves the React app because the build output is embedded at compile time.
