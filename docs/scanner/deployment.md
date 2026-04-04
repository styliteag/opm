# Scanner Deployment Guide

This guide covers how to deploy the standalone scanner agent and how that differs from the development setup in `compose-dev.yml`.

## Overview

The scanner is a separate Python 3.12 container that:

- authenticates with the backend using an API key
- receives short-lived scanner JWTs from `/api/scanner/auth`
- polls for port-scan and host-discovery jobs
- runs `masscan`, `nmap`, and `ssh-audit`
- streams logs and progress back to the backend

For production or remote deployments, the scanner container reads these environment variables directly:

- `BACKEND_URL`
- `API_KEY`
- `POLL_INTERVAL`
- `LOG_LEVEL`

Important: the repository root `compose-dev.yml` uses prefixed host-side variables such as `SCANNER_BACKEND_URL` and maps them into the container as `BACKEND_URL`. The scanner process itself only reads the unprefixed names inside the container.

## Prerequisites

- Docker 20.10+ or compatible container runtime
- outbound network access from the scanner host to the backend
- a scanner record created in the web UI or via `POST /api/scanners`
- the scanner API key shown at creation time or after key regeneration

## Creating A Scanner Record

In the current UI, scanners are managed from the dedicated **Scanners** page, not from a settings submenu.

Workflow:

1. Open the web UI.
2. Go to **Scanners**.
3. Create a scanner.
4. Copy the API key immediately. It is only returned once.

## Minimal Deployment

### Docker Run

```bash
docker run -d \
  --name opm-scanner \
  --restart unless-stopped \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e BACKEND_URL=https://monitor.example.com \
  -e API_KEY=your-scanner-api-key \
  -e POLL_INTERVAL=60 \
  -e LOG_LEVEL=INFO \
  styliteag/opm-scanner:latest
```

### Docker Compose

```yaml
services:
  scanner:
    image: styliteag/opm-scanner:latest
    restart: unless-stopped
    cap_add:
      - NET_RAW
      - NET_ADMIN
    environment:
      BACKEND_URL: https://monitor.example.com
      API_KEY: ${API_KEY}
      POLL_INTERVAL: 60
      LOG_LEVEL: INFO
```

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `BACKEND_URL` | Yes | none | Base backend URL; trailing slash is stripped |
| `API_KEY` | Yes | none | Scanner API key |
| `POLL_INTERVAL` | No | `60` | Seconds between polls; values below `5` are clamped to `5` |
| `LOG_LEVEL` | No | `INFO` | Any Python logging level; invalid values effectively fall back to `INFO` |

## Required Capabilities

The scanner container must run with:

- `NET_RAW`
- `NET_ADMIN`

Without them, packet-based scanning and parts of host discovery will fail.

## What The Container Expects At Startup

On startup the scanner:

1. loads environment variables
2. checks whether `masscan` and `nmap` are available in `PATH`
3. waits for the backend `/health` endpoint to respond
4. authenticates with `POST /api/scanner/auth`
5. begins polling for jobs

The scanner image also installs `ssh-audit` so it can perform SSH security probing after port discovery.

## Deployment Patterns

### Same Host As Backend

Use an internal service name when both run on the same Docker network:

```yaml
services:
  backend:
    image: your-backend

  scanner:
    image: styliteag/opm-scanner:latest
    environment:
      BACKEND_URL: http://backend:8000
      API_KEY: ${API_KEY}
    cap_add:
      - NET_RAW
      - NET_ADMIN
```

### Remote Site Scanner

Use a public or VPN-reachable backend URL:

```bash
docker run -d \
  --name opm-scanner-branch-1 \
  --restart unless-stopped \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  -e BACKEND_URL=https://monitor.company.example \
  -e API_KEY=branch-1-key \
  styliteag/opm-scanner:latest
```

Each remote scanner should have its own API key and its own scanner record.

## Health And Operations

### Check Container Health

```bash
docker ps
docker logs -f opm-scanner
```

### Check Installed Binaries

```bash
docker exec opm-scanner which masscan
docker exec opm-scanner which nmap
docker exec opm-scanner which ssh-audit
```

### Useful Log Messages

Healthy startup usually includes messages like:

```text
STYLiTE Orbit Monitor Scanner vX.Y.Z starting...
Polling interval set to 60 seconds
Waiting for backend to be ready...
Backend is ready
Authenticating scanner with backend
```

## IPv6 Notes

Before any IPv6 scan or IPv6 host-discovery job, the scanner performs a connectivity check against well-known public IPv6 DNS endpoints. If that check fails, the job fails fast instead of hanging indefinitely.

## Development Compose Notes

The root `compose-dev.yml` behaves slightly differently from a standalone deployment:

- the container receives `BACKEND_URL` from `SCANNER_BACKEND_URL`
- the container receives `API_KEY` from `SCANNER_API_KEY`
- the container receives `POLL_INTERVAL` from `SCANNER_POLL_INTERVAL`
- the container receives `LOG_LEVEL` from `SCANNER_LOG_LEVEL`
- source is bind-mounted from `./scanner/src:/app/src`
- scanner code changes require a container restart; there is no automatic hot reload

## Troubleshooting Pointers

- Authentication issues: see [Troubleshooting](troubleshooting.md#authentication-failures)
- Internal scanner behavior: see [Architecture](architecture.md)
- Scanner-to-backend payloads: see [Scanner API](../api/scanner-api.md)
