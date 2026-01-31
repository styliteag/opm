# SSH Security API

The SSH Security API provides endpoints for retrieving SSH security scan results, host security status, and exporting compliance reports.

## Overview

SSH security scanning is integrated into the regular network scan workflow. When a scan discovers SSH services (port 22 or services identified as SSH), the scanner automatically probes them using `ssh-audit` to extract security configuration data.

## Endpoints

### Get SSH Results for a Scan

Retrieve SSH security scan results for a specific scan.

```
GET /api/scans/{scan_id}/ssh
```

**Path Parameters:**
- `scan_id` (integer, required): The scan ID

**Response:**
```json
{
  "ssh_results": [
    {
      "id": 1,
      "scan_id": 10,
      "host_ip": "192.168.1.100",
      "port": 22,
      "timestamp": "2024-01-15T10:30:00Z",
      "publickey_enabled": true,
      "password_enabled": true,
      "keyboard_interactive_enabled": false,
      "ssh_version": "OpenSSH_8.9p1",
      "protocol_version": "2.0",
      "server_banner": "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1",
      "supported_ciphers": [
        {"name": "aes256-gcm@openssh.com", "keysize": 256, "is_weak": false, "notes": []},
        {"name": "aes128-cbc", "keysize": 128, "is_weak": true, "notes": ["[WARN] CBC mode vulnerable to BEAST"]}
      ],
      "kex_algorithms": [
        {"name": "curve25519-sha256", "keysize": null, "is_weak": false, "notes": []},
        {"name": "diffie-hellman-group14-sha1", "keysize": 2048, "is_weak": true, "notes": ["[FAIL] SHA1 is deprecated"]}
      ],
      "mac_algorithms": [
        {"name": "hmac-sha2-256-etm@openssh.com", "keysize": null, "is_weak": false, "notes": []}
      ],
      "host_key_types": ["ssh-ed25519", "rsa-sha2-512"]
    }
  ]
}
```

### List SSH Hosts

Retrieve a paginated list of all SSH hosts with their latest security status.

```
GET /api/ssh/hosts
```

**Query Parameters:**
- `limit` (integer, optional): Maximum results (default: 50, max: 200)
- `offset` (integer, optional): Pagination offset (default: 0)
- `network_id` (integer, optional): Filter by network ID

**Response:**
```json
{
  "hosts": [
    {
      "host_ip": "192.168.1.100",
      "port": 22,
      "ssh_version": "OpenSSH_8.9p1",
      "protocol_version": "2.0",
      "publickey_enabled": true,
      "password_enabled": true,
      "keyboard_interactive_enabled": false,
      "has_weak_ciphers": true,
      "has_weak_kex": true,
      "last_scanned": "2024-01-15T10:30:00Z",
      "network_id": 1,
      "network_name": "Production",
      "config_changed": false
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Get SSH Host History

Retrieve the scan history for a specific SSH host.

```
GET /api/ssh/hosts/{host_ip}
```

**Path Parameters:**
- `host_ip` (string, required): The host IP address

**Query Parameters:**
- `port` (integer, optional): Filter by port (default: all ports)

**Response:**
```json
{
  "host_ip": "192.168.1.100",
  "history": [
    {
      "scan_id": 10,
      "port": 22,
      "timestamp": "2024-01-15T10:30:00Z",
      "ssh_version": "OpenSSH_8.9p1",
      "publickey_enabled": true,
      "password_enabled": true,
      "has_weak_ciphers": true,
      "has_weak_kex": true
    },
    {
      "scan_id": 8,
      "port": 22,
      "timestamp": "2024-01-14T10:30:00Z",
      "ssh_version": "OpenSSH_8.9p1",
      "publickey_enabled": true,
      "password_enabled": false,
      "has_weak_ciphers": true,
      "has_weak_kex": true
    }
  ]
}
```

### Export PDF Report

Generate a PDF compliance report for SSH security findings.

```
GET /api/ssh/export/pdf
```

**Query Parameters:**
- `network_id` (integer, optional): Filter by network ID

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="ssh-security-report-YYYY-MM-DD.pdf"`

The PDF report includes:
- Executive summary with host counts and security statistics
- Hosts with insecure authentication methods
- Hosts with weak ciphers
- Hosts with weak key exchange algorithms
- Hosts with outdated SSH versions
- Remediation recommendations

### Export CSV Report

Export SSH security data as CSV for further analysis.

```
GET /api/ssh/export/csv
```

**Query Parameters:**
- `network_id` (integer, optional): Filter by network ID

**Response:**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="ssh-security-report-YYYY-MM-DD.csv"`

CSV columns:
- `host_ip`, `port`, `network`, `ssh_version`, `protocol_version`
- `publickey_enabled`, `password_enabled`, `keyboard_interactive_enabled`
- `has_weak_ciphers`, `weak_ciphers` (semicolon-separated list)
- `has_weak_kex`, `weak_kex` (semicolon-separated list)
- `last_scanned`

## SSH Alert Types

The system generates the following SSH-related alerts:

| Alert Type | Description |
|------------|-------------|
| `ssh_insecure_auth` | Password or keyboard-interactive authentication is enabled |
| `ssh_weak_cipher` | Server supports weak encryption ciphers (DES, 3DES, RC4, Blowfish, CBC modes) |
| `ssh_weak_kex` | Server supports weak key exchange algorithms (SHA1-based, weak DH groups) |
| `ssh_outdated_version` | SSH version is below the configured threshold (default: 8.0) |
| `ssh_config_regression` | SSH configuration became less secure compared to previous scan |

### Configuring SSH Alerts

SSH alert thresholds can be configured per-network via the network settings API:

```json
{
  "alert_config": {
    "ssh_insecure_auth": true,
    "ssh_weak_cipher": true,
    "ssh_weak_kex": true,
    "ssh_outdated_version": true,
    "ssh_version_threshold": "8.0.0",
    "ssh_config_regression": true
  }
}
```

## Security Classifications

### Weak Ciphers

The following ciphers are classified as weak:
- DES family: `des-cbc`, `3des-cbc`
- RC4 family: `arcfour`, `arcfour128`, `arcfour256`
- Blowfish: `blowfish-cbc`
- CBC mode ciphers: `aes128-cbc`, `aes192-cbc`, `aes256-cbc` (vulnerable to BEAST-style attacks)

### Weak Key Exchange Algorithms

The following KEX algorithms are classified as weak:
- SHA1-based: `diffie-hellman-group14-sha1`, `diffie-hellman-group-exchange-sha1`
- Weak DH groups: `diffie-hellman-group1-sha1`
- NIST curves (NSA concerns): `ecdh-sha2-nistp256`, `ecdh-sha2-nistp384`, `ecdh-sha2-nistp521`

### Weak MAC Algorithms

The following MAC algorithms are classified as weak:
- MD5-based: `hmac-md5`, `hmac-md5-96`
- SHA1-based: `hmac-sha1`, `hmac-sha1-96`
