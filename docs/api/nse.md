# NSE Vulnerability Scanning API

The NSE (Nmap Scripting Engine) scanning system provides vulnerability detection using nmap's built-in script library. Scans are configured via **profiles** — named groups of NSE scripts with severity and platform metadata.

## Profiles

Profiles define which NSE scripts to run. There are two types:

- **builtin** — Ship with the product, read-only. Clone to customize.
- **custom** — User-created or cloned from built-in profiles. Fully editable.

### List Profiles

```
GET /api/nse/profiles
```

Query parameters:
- `search` — Filter by name/description (partial match)
- `severity` — Filter by severity: `critical`, `high`, `medium`, `info`
- `platform` — Filter by platform: `any`, `ssh`, `http`, `smb`, `ssl`, `ftp`, `dns`
- `type` — Filter by type: `builtin`, `custom`

### Get Profile

```
GET /api/nse/profiles/{profile_id}
```

### Create Profile

```
POST /api/nse/profiles
```

```json
{
  "name": "My Custom Scan",
  "description": "Checks for common web vulnerabilities",
  "nse_scripts": ["http-sql-injection", "http-stored-xss", "vulners"],
  "severity": "high",
  "platform": "http"
}
```

### Clone Profile

```
POST /api/nse/profiles/{profile_id}/clone?name=My%20Copy
```

Creates a custom copy of any profile (builtin or custom) with the given name. The clone is fully editable.

### Update Profile

```
PUT /api/nse/profiles/{profile_id}
```

Only custom profiles can be updated. Built-in profiles return 400 with guidance to clone.

### Delete Profile

```
DELETE /api/nse/profiles/{profile_id}
```

Only custom profiles can be deleted. Built-in profiles return 400.

## Scans

### Trigger NSE Scan

```
POST /api/nse/scan
```

```json
{
  "network_id": 1,
  "template_id": 5,
  "target_ip": "10.0.0.1"
}
```

- `network_id` — Required. Which network to scan.
- `template_id` — Optional. Profile to use. If omitted, uses default scripts (vulners, banner, ssl-cert, http-title).
- `target_ip` — Optional. Scan a single host instead of the full network.

The scan runs on ports already discovered by previous masscan/nmap scans using `nmap -Pn -sV --script <scripts>`.

## Results

### List Results

```
GET /api/nse/results
```

Query parameters:
- `scan_id` — Filter by scan
- `severity` — Filter by severity
- `ip` — Filter by IP address
- `cve` — Filter by CVE ID (partial match)

### Get Scan Results

```
GET /api/nse/results/{scan_id}
```

### Result Object

```json
{
  "id": 1,
  "scan_id": 7,
  "ip": "10.0.0.1",
  "port": 445,
  "protocol": "tcp",
  "script_name": "smb-vuln-ms17-010",
  "script_output": "VULNERABLE: Remote Code Execution...",
  "cve_ids": ["CVE-2017-0144", "CVE-2017-0145"],
  "severity": "critical",
  "template_id": 5,
  "created_at": "2026-03-21T22:30:00"
}
```

## Alerts

NSE scans automatically generate alerts for findings containing CVE identifiers or "VULNERABLE" markers:

- **nse_cve_detected** — Specific CVE(s) found in script output
- **nse_vulnerability** — Generic vulnerability finding (VULNERABLE marker without specific CVE)

Alerts appear in the standard Alerts page and can be filtered by source "NSE". They follow the same lifecycle (dismiss, assign, resolve) as other alert types.

## Built-in Profiles

### Scan Groups (multi-script)

| Profile | Scripts | Severity | Platform |
|---------|---------|----------|----------|
| Quick Scan | vulners, banner, ssl-cert, http-title | high | any |
| Full Vulnerability Scan | 20 scripts across all platforms | critical | any |
| Web Application Scan | 14 HTTP/SSL scripts | critical | http |
| Infrastructure Scan | 15 SMB/FTP/DNS/SSH scripts | high | any |
| SSL/TLS Audit | 11 SSL/TLS scripts | high | ssl |

### Individual Checks

| Profile | Scripts | Severity |
|---------|---------|----------|
| EternalBlue SMB (MS17-010) | smb-vuln-ms17-010 | critical |
| Shellshock (CVE-2014-6271) | http-shellshock | critical |
| Heartbleed (CVE-2014-0160) | ssl-heartbleed | critical |
| Apache Struts RCE | http-vuln-cve2017-5638 | critical |
| Default Credentials Check | ftp-anon, http-default-accounts, snmp-brute | critical |
| HTTP SQL Injection | http-sql-injection | critical |
| Vulners CVE Lookup | vulners | high |
| SMB Share Enumeration | smb-enum-shares, smb-enum-users | high |
| FTP Anonymous Login | ftp-anon | high |
| DNS Zone Transfer | dns-zone-transfer | high |
| HTTP XSS Detection | http-stored-xss, http-dombased-xss, http-phpself-xss | high |
| SSH Algorithms Audit | ssh2-enum-algos, ssh-hostkey, ssh-auth-methods | medium |
| HTTP Enumeration | http-enum | medium |
| HTTP Security Headers | http-security-headers, http-headers | medium |
| SMB OS Discovery | smb-os-discovery | info |
| Service Banner Grabbing | banner | info |
