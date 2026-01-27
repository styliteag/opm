# Scanner Troubleshooting Guide

This guide helps diagnose and resolve common scanner agent issues.

## Table of Contents

- [Authentication Failures](#authentication-failures)
- [Network Connectivity Issues](#network-connectivity-issues)
- [Permission Errors](#permission-errors)
- [Checking Scanner Status](#checking-scanner-status)
- [Scan Timeout Configuration](#scan-timeout-configuration)
- [Masscan vs Nmap Selection](#masscan-vs-nmap-selection)
- [Interpreting Scanner Logs](#interpreting-scanner-logs)

---

## Authentication Failures

### Symptoms

- Scanner logs show `401 Unauthorized` errors
- Scanner cannot poll for jobs
- Backend shows scanner as offline

### Common Causes and Solutions

#### Invalid API Key

**Error**: `401 Unauthorized: Invalid API key`

**Cause**: The API key configured in the scanner doesn't match any registered scanner.

**Solutions**:
1. Verify the `API_KEY` environment variable is set correctly
2. Confirm the scanner exists in the backend (Settings > Scanners in the UI)
3. API keys are shown only once at creation - if lost, delete the scanner and create a new one
4. Ensure no whitespace or line breaks in the key value

#### Expired JWT Token

**Error**: `401 Unauthorized` on API calls after authentication

**Cause**: Scanner JWT tokens expire after 15 minutes.

**Solution**: The scanner should automatically re-authenticate. If not:
1. Check scanner logs for authentication errors
2. Restart the scanner container to force re-authentication
3. Verify the backend is accessible

#### Rate Limiting

**Error**: `429 Too Many Requests: Rate limit exceeded. Maximum 10 attempts per minute.`

**Cause**: Too many authentication attempts from the same IP address.

**Solutions**:
1. Wait 60 seconds before retrying
2. Check for configuration errors causing repeated auth failures
3. If running multiple scanners behind NAT, consider spacing their startup times

---

## Network Connectivity Issues

### Symptoms

- Scanner shows as offline in the UI
- Jobs not being claimed
- Scans timing out or failing

### Common Causes and Solutions

#### Scanner Cannot Reach Backend

**Verification steps**:
```bash
# Inside the scanner container
curl -I https://your-backend-url/api/scanner/jobs
```

**Solutions**:
1. Verify `BACKEND_URL` environment variable is correct
2. Check firewall rules allow outbound HTTPS (port 443)
3. If using internal DNS, ensure the hostname resolves correctly
4. For self-signed certificates, the scanner must trust the CA

#### Connection Timeouts

The scanner uses retry logic with exponential backoff:
- Initial retry: 1 second
- Maximum backoff: 30 seconds
- Maximum retries: 5

**If connections consistently timeout**:
1. Check network latency between scanner and backend
2. Verify no proxy interference
3. Check backend server health and load

#### Scanner Appears Offline

The backend marks a scanner as offline if it hasn't polled within 2x the poll interval.

**Solutions**:
1. Verify the scanner container is running: `docker ps`
2. Check scanner logs for errors: `docker logs scanner-agent`
3. Ensure `POLL_INTERVAL` isn't set too high (default: 60 seconds)
4. Verify no firewall blocking outbound connections

---

## Permission Errors

### Symptoms

- Scan fails immediately after starting
- Logs show "Permission denied" errors
- `masscan` or `nmap` cannot send packets

### Required Docker Capabilities

The scanner requires two Linux capabilities:

#### NET_RAW

**Purpose**: Allows creating raw network sockets for packet crafting.

**Required for**:
- Port scanning with custom IP packets
- Advanced scanning techniques
- IPv6 connectivity checks
- MAC address detection

**Error without it**:
```
Permission denied: requires NET_RAW capability
```

#### NET_ADMIN

**Purpose**: Allows low-level network configuration.

**Required for**:
- Packet filtering and routing
- ARP ping for host discovery
- Network statistics access

### Solution

Ensure your Docker run command or compose file includes both capabilities:

**Docker run**:
```bash
docker run --cap-add=NET_RAW --cap-add=NET_ADMIN ...
```

**Docker Compose**:
```yaml
services:
  scanner:
    cap_add:
      - NET_RAW
      - NET_ADMIN
```

### Rootless Container Environments

Some environments (Podman rootless, certain Kubernetes configs) may not allow these capabilities. Options:
1. Run in a privileged security context (if permitted)
2. Use a dedicated scanning host with proper permissions
3. Consult your platform's documentation for capability management

---

## Checking Scanner Status

### In the Web UI

1. Navigate to **Settings > Scanners**
2. Each scanner shows:
   - **Online/Offline** status based on last poll time
   - **Version** reported by the scanner agent
   - **Last seen** timestamp

A scanner appears **offline** if it hasn't polled within 2x its configured poll interval.

### From Scanner Logs

Check scanner container logs:
```bash
# Docker
docker logs scanner-agent

# Docker Compose
docker compose logs scanner

# Follow logs in real-time
docker logs -f scanner-agent
```

**Healthy scanner log output**:
```
INFO: Starting scanner agent...
INFO: Successfully authenticated with backend
INFO: Polling for jobs...
INFO: No jobs available, waiting 60 seconds
```

### Backend Scan Status

Scans go through these status transitions:

| Status | Description |
|--------|-------------|
| `planned` | Waiting to be claimed by a scanner |
| `running` | Actively being scanned |
| `completed` | Successfully finished |
| `failed` | Error occurred during scan |
| `cancelled` | User cancelled the scan |

**Failed scans** include an `error_message` field with details about the failure.

---

## Scan Timeout Configuration

### Timeout Settings

Each network has two configurable timeouts:

| Setting | Default | Description |
|---------|---------|-------------|
| `scan_timeout` | 3600 (1 hour) | Maximum total scan duration |
| `port_timeout` | 1500 (ms) | Timeout per port probe |

### When to Adjust Timeouts

**Increase `scan_timeout` when**:
- Scanning large IP ranges
- Network has high latency
- Using nmap with service detection (slower than masscan)

**Increase `port_timeout` when**:
- Scanning across WAN links
- Targets have slow response times
- Seeing many false negatives

**Decrease `port_timeout` when**:
- Scanning local network with low latency
- Need faster scans and can accept some missed ports

### Timeout Behavior

**Masscan**:
- Background timeout watcher monitors progress
- Logs warning at 90% of timeout
- Terminates scan at 100% of timeout

**Nmap**:
- Phase 1 (discovery): Gets 70% of total timeout
- Phase 2 (service detection): Gets 30% of timeout (minimum 120 seconds)

### Setting Timeouts

Configure timeouts when creating or editing a network:

```bash
# Create network with custom timeouts
curl -X POST "https://backend/api/networks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production",
    "cidr": "10.0.0.0/16",
    "scan_timeout": 7200,
    "port_timeout": 2000
  }'
```

---

## Masscan vs Nmap Selection

### When to Use Each Scanner

| Scanner | Best For | Trade-offs |
|---------|----------|------------|
| **masscan** | Large networks, fast discovery | Less service detail, may miss some ports |
| **nmap** | Thorough scanning, service detection | Slower, better for smaller ranges |

### Configuration

Set the scanner type per network:

```bash
curl -X PATCH "https://backend/api/networks/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scanner_type": "nmap"}'
```

Valid values: `masscan` (default), `nmap`

### Hybrid Scanning Mode

When using masscan with service detection enabled:
1. **Masscan phase (0-75% progress)**: Fast port discovery
2. **Nmap phase (75-100% progress)**: Service detection on discovered ports

This provides the speed of masscan with the detail of nmap.

### Feature Comparison

| Feature | Masscan | Nmap |
|---------|---------|------|
| Port exclusions (!22) | Supported | Not supported |
| Service detection | Via hybrid mode | Native |
| IPv6 scanning | Native | Via `-6` flag |
| UDP scanning | Supported | Supported |
| Speed | Very fast | Moderate |

### Troubleshooting Scanner-Specific Issues

**Masscan not finding ports**:
- Increase scan rate (but watch for rate limiting by firewalls)
- Verify target network allows raw packet scanning
- Check if ports are filtered by IDS/IPS

**Nmap scanning too slow**:
- Reduce port range or IP range
- Increase timeout values
- Consider using masscan for initial discovery

---

## Interpreting Scanner Logs

### Log Levels

| Level | Description |
|-------|-------------|
| `info` | Normal operations, progress updates |
| `warning` | Non-fatal issues, retries, timeouts |
| `error` | Failures requiring attention |

### Common Log Messages

#### Successful Operations

```
INFO: Authenticated with backend successfully
INFO: Claimed scan job for network "Production"
INFO: Starting masscan on 192.168.1.0/24
INFO: Scan progress: 50%
INFO: Scan completed, submitting results
INFO: Submitted 150 open ports
```

#### Authentication Issues

```
ERROR: Authentication failed: Invalid API key
WARNING: Rate limited, waiting 60 seconds
ERROR: Authentication failed after 5 retries
```

#### Network Issues

```
WARNING: Connection timeout, retrying in 2s
WARNING: Connection timeout, retrying in 4s
ERROR: Failed to connect to backend after 5 attempts
```

#### Permission Issues

```
ERROR: masscan: FAIL: could not initialize network adapter
ERROR: Operation not permitted (requires NET_RAW capability)
ERROR: Failed to open raw socket
```

#### Scan Execution Issues

```
WARNING: Scan timeout at 90%, terminating soon
ERROR: Scan cancelled by user
WARNING: No hosts responded to discovery
INFO: No open ports found
```

### Reading Logs in the UI

1. Navigate to **Networks > [Network Name] > Scans**
2. Click on a specific scan
3. Select the **Logs** tab to see timestamped entries

Logs are streamed in real-time during scan execution and stored permanently for review.

### Log Filtering

Use log levels to filter important messages:
- Focus on `error` logs first for failures
- Check `warning` logs for degraded operations
- Use `info` logs to trace execution flow

---

## Quick Reference: Error Codes

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Token expired or invalid key | Re-authenticate or verify API key |
| 404 | Resource not found | Verify scan/network ID and scanner assignment |
| 409 | Conflict (job claimed) | Skip job, poll for others |
| 429 | Rate limited | Wait 60 seconds |
| 500 | Server error | Check backend logs, report if persistent |

---

## Getting Help

If issues persist after following this guide:

1. Collect scanner logs: `docker logs scanner-agent > scanner.log 2>&1`
2. Note the scan ID and network configuration
3. Check backend logs for corresponding errors
4. Open an issue with logs and configuration details (redact sensitive info)
