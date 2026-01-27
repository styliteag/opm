# Scanner Deployment Guide

This guide covers deploying and configuring the Open Port Monitor scanner agent.

## Prerequisites

- Docker 20.10+ and Docker Compose v2+
- Network access to the backend API endpoint
- Scanner API key (generated in the web UI under Scanners)

## Quick Start

### Using Docker Run

```bash
docker run -d \
  --name opm-scanner \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  -e BACKEND_URL=https://your-server.com:8000 \
  -e API_KEY=your-api-key-here \
  styliteag/open-port-monitor-scanner:latest
```

### Using Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  scanner:
    image: styliteag/open-port-monitor-scanner:latest
    # Or use GitHub Container Registry:
    # image: ghcr.io/styliteag/open-port-monitor-scanner:latest
    environment:
      BACKEND_URL: ${BACKEND_URL}
      API_KEY: ${API_KEY}
      POLL_INTERVAL: ${POLL_INTERVAL:-60}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
    cap_add:
      - NET_RAW
      - NET_ADMIN
    restart: unless-stopped
```

Create a `.env` file:

```bash
BACKEND_URL=https://your-server.com:8000
API_KEY=your-api-key-here
POLL_INTERVAL=60
LOG_LEVEL=INFO
```

Start the scanner:

```bash
docker compose up -d
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKEND_URL` | Yes | - | Full URL to backend API (e.g., `https://monitor.example.com:8000`) |
| `API_KEY` | Yes | - | Scanner API key for authentication |
| `POLL_INTERVAL` | No | 60 | Seconds between job polling (minimum: 5) |
| `LOG_LEVEL` | No | INFO | Logging level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |

### Environment Variable Notes

- `BACKEND_URL`: Trailing slashes are automatically removed
- `POLL_INTERVAL`: Values below 5 seconds are reset to 60 seconds
- `LOG_LEVEL`: Case-insensitive; invalid values default to INFO

## Required Capabilities

The scanner requires two Linux capabilities to perform network scanning:

### NET_RAW

Required for raw socket operations used by masscan and nmap:
- Crafting custom IP packets for port scanning
- Advanced scanning techniques and packet construction
- IPv6 connectivity checks
- MAC address detection on local networks

### NET_ADMIN

Required for network interface operations:
- Low-level network configuration
- Packet filtering and routing
- ARP ping for host discovery
- Network statistics access

Without these capabilities, scans will fail with permission errors.

## Deployment Scenarios

### Same-Host Deployment

Scanner and backend on the same Docker host sharing a network:

```yaml
services:
  backend:
    # ... backend configuration ...
    networks:
      - opm-network

  scanner:
    image: styliteag/open-port-monitor-scanner:latest
    environment:
      BACKEND_URL: http://backend:8000  # Internal Docker DNS
      API_KEY: ${SCANNER_API_KEY}
    cap_add:
      - NET_RAW
      - NET_ADMIN
    networks:
      - opm-network
    depends_on:
      - backend
    restart: unless-stopped

networks:
  opm-network:
    driver: bridge
```

**Advantages:**
- Simplest setup
- No network latency between scanner and backend
- Internal container networking

**Use case:** Lab environments, single-site deployments

### Remote Deployment

Scanner on a separate host connecting to a centralized backend:

```bash
# On the remote host
docker run -d \
  --name opm-scanner \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --restart unless-stopped \
  -e BACKEND_URL=https://monitor.company.com:8000 \
  -e API_KEY=scanner-site-1-key \
  -e POLL_INTERVAL=60 \
  -e LOG_LEVEL=INFO \
  styliteag/open-port-monitor-scanner:latest
```

**Requirements:**
- Outbound HTTPS access to backend API
- Valid TLS certificate on backend (for production)
- Firewall rules allowing egress to backend port

**Advantages:**
- Distributed scanning from multiple locations
- Each site scans its own networks
- Central dashboard for all results

### Multiple Sites Deployment

Deploy scanners at different locations, all reporting to a central backend:

```
                    [Central Backend/Dashboard]
                           |
              [HTTPS API on Port 8000]
              /              |              \
         [Office]       [Datacenter]     [Branch]
         Scanner         Scanner          Scanner
```

Each scanner needs its own API key (generated in the web UI):

**Office Scanner:**
```bash
BACKEND_URL=https://monitor.company.com:8000
API_KEY=office-scanner-key-abc123
```

**Datacenter Scanner:**
```bash
BACKEND_URL=https://monitor.company.com:8000
API_KEY=datacenter-scanner-key-xyz789
```

**Job Assignment:**
- Networks are assigned to specific scanners in the web UI
- Each scanner only receives jobs for its assigned networks
- Scanner authenticates with its unique API key

## Health Monitoring

### Container Status

Check if the scanner container is running:

```bash
# View container status
docker ps | grep opm-scanner

# View container stats (CPU, memory, network)
docker stats opm-scanner
```

### Polling Heartbeat

The scanner updates its `last_seen_at` timestamp each time it polls for jobs. View scanner status in the web UI under **Scanners** to see:
- Last seen timestamp
- Connection status (online/offline)
- Assigned networks

A scanner appears offline if it hasn't polled within 2x the poll interval.

### Custom Health Check

Add a health check to your Docker Compose configuration:

```yaml
scanner:
  image: styliteag/open-port-monitor-scanner:latest
  healthcheck:
    test: ["CMD", "pgrep", "-f", "python"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 10s
  # ... other configuration ...
```

### Dependency Verification

Verify scanning tools are available inside the container:

```bash
# Check tool availability
docker exec opm-scanner which masscan
docker exec opm-scanner which nmap

# Check tool versions
docker exec opm-scanner masscan --version
docker exec opm-scanner nmap --version
```

## Log Viewing

### Real-Time Logs

Follow scanner logs in real-time:

```bash
# Using docker compose
docker compose logs -f scanner

# Using docker directly
docker logs -f opm-scanner
```

### Filtered Logs

View specific log levels or time ranges:

```bash
# Last 100 lines with timestamps
docker compose logs --tail=100 -t scanner

# Logs from the last 10 minutes
docker compose logs --since 10m scanner

# Filter for errors and warnings
docker compose logs scanner | grep -E "ERROR|WARNING"

# Filter for scan completions
docker compose logs scanner | grep "completed"
```

### Log Format

Scanner logs use this format:
```
%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

Example output:
```
2024-01-27 10:30:00 - scanner - INFO - Open Port Monitor Scanner starting...
2024-01-27 10:30:00 - scanner - INFO - Polling interval set to 60 seconds
2024-01-27 10:30:05 - scanner - INFO - Found 2 pending port scan job(s)
2024-01-27 10:30:05 - scanner - INFO - Running masscan for 192.168.1.0/24
2024-01-27 10:31:45 - scanner - INFO - Masscan completed with 5 open ports
```

### Web UI Logs

Scan logs are also stored in the database and viewable in the web UI:
1. Navigate to **Scans**
2. Click on a specific scan
3. View the **Logs** tab for timestamped log entries

## Building from Source

If you need to build the scanner image locally:

```bash
# Clone the repository
git clone https://github.com/styliteag/open-port-monitor.git
cd open-port-monitor

# Build the scanner image
docker build -t opm-scanner:local -f scanner/Dockerfile .

# Or use the scanner's compose file
cd scanner
docker compose build
```

The Dockerfile installs:
- Python 3.12 with required dependencies
- masscan for fast port discovery
- nmap for service detection
- Network utilities (iputils-ping, tcpdump, iproute2, etc.)

## Troubleshooting

### Scanner Not Connecting

1. Verify network connectivity:
   ```bash
   docker exec opm-scanner curl -v ${BACKEND_URL}/health
   ```

2. Check API key is valid:
   ```bash
   docker exec opm-scanner curl -X POST \
     -H "X-Api-Key: ${API_KEY}" \
     ${BACKEND_URL}/api/scanner/auth
   ```

3. Review logs for authentication errors:
   ```bash
   docker logs opm-scanner | grep -i "auth\|401\|403"
   ```

### Scans Failing

1. Verify capabilities are set:
   ```bash
   docker inspect opm-scanner | grep -A5 "CapAdd"
   ```

2. Check scanning tools:
   ```bash
   docker exec opm-scanner masscan --version
   docker exec opm-scanner nmap --version
   ```

3. Review scan-specific logs in the web UI

### IPv6 Scans Failing

The scanner checks IPv6 connectivity before scanning IPv6 networks. If the check fails, ensure:
- The Docker host has IPv6 connectivity
- Docker is configured for IPv6 (add `"ipv6": true` to Docker daemon config)
- The container network supports IPv6

## Next Steps

- [Scanner Architecture](architecture.md) - Understand how the scanner works internally
- [Scanner Troubleshooting](troubleshooting.md) - Diagnose common issues
- [Scanner API Reference](../api/scanner-api.md) - API documentation for custom integrations
