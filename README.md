# Open Port Monitor

Distributed network port scanning and monitoring system for security purposes with multi-site scanner support, alerting, and web dashboard.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### Development Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd open-port-monitor
   ```

2. Copy the environment file and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. Start the development environment:
   ```bash
   docker compose -f compose-dev.yml up --build
   ```

4. Access the services:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Database: localhost:3306

### Services

| Service  | Port | Description                          |
|----------|------|--------------------------------------|
| frontend | 5173 | React + Vite web dashboard           |
| backend  | 8000 | FastAPI REST API                     |
| db       | 3306 | MariaDB database                     |
| scanner  | -    | Masscan-based network scanner agent  |

### Development

The development environment uses bind mounts for hot-reloading:

- `./backend/src` -> `/app/src` (Backend)
- `./frontend/src` -> `/app/src` (Frontend)
- `./scanner/src` -> `/app/src` (Scanner)

Changes to source files will automatically trigger reloads.

### Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `JWT_SECRET`: Secret key for JWT token signing (change in production!)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Initial admin credentials
- `SMTP_*`: Email configuration for alerts

## Running a Scanner Agent

The scanner agent can be deployed on a different host to connect to your main Open Port Monitor server. This enables distributed scanning from multiple locations.

### Prerequisites

- Docker installed on the scanner host
- API key from the main server (create via the web dashboard or API)
- Network connectivity to the main server's backend API

### Option 1: Docker Run

First, build the scanner image (from the project root):

```bash
docker build -f scanner/Dockerfile --build-arg VERSION=$(cat VERSION) -t opm-scanner:latest scanner
```

Or use a pre-built image from a registry:

```bash
docker pull your-registry/open-port-monitor-scanner:latest
```

Then run the scanner:

```bash
docker run -d \
  --name opm-scanner \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  -e BACKEND_URL=https://your-server.com:8000 \
  -e API_KEY=your-api-key-here \
  -e POLL_INTERVAL=60 \
  -e LOG_LEVEL=INFO \
  opm-scanner:latest
```

**Required environment variables:**
- `BACKEND_URL`: Full URL to your main server's backend API (e.g., `https://monitor.example.com:8000`)
- `API_KEY`: Scanner API key obtained from the main server

**Optional environment variables:**
- `POLL_INTERVAL`: Seconds between job polls (default: 60)
- `LOG_LEVEL`: Logging level - DEBUG, INFO, WARNING, ERROR (default: INFO)

### Option 2: Docker Compose

1. Navigate to the scanner directory:
   ```bash
   cd scanner
   ```

2. Create a `.env` file with your configuration:
   ```bash
   cat > .env << EOF
   BACKEND_URL=https://your-server.com:8000
   API_KEY=your-api-key-here
   POLL_INTERVAL=60
   LOG_LEVEL=INFO
   EOF
   ```

3. Start the scanner:
   ```bash
   docker compose up -d
   ```

4. View logs:
   ```bash
   docker compose logs -f
   ```

The scanner will automatically connect to your main server and start processing scan jobs.

**Note:** The scanner requires `NET_RAW` and `NET_ADMIN` capabilities to perform network scans. These are automatically configured in the compose file.

## Architecture

```
+-------------+     +---------+     +----------+
|   Frontend  |<--->| Backend |<--->| Database |
| (React/Vite)|     | (FastAPI)|     | (MariaDB)|
+-------------+     +---------+     +----------+
                         ^
                         |
              +----------+----------+
              |          |          |
         +--------+ +--------+ +--------+
         |Scanner1| |Scanner2| |Scanner3|
         +--------+ +--------+ +--------+
              (Distributed at different sites)
```

## License

MIT
