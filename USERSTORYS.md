# Open Port Monitor - User & Admin Stories

> **Legend**: Stories without a status marker are implemented. Stories marked with `> **Status: Planned**` are documented but not yet built.

## Core User Stories

### Login

**As a user**, I want to log in with my email and password, so I can access the platform securely.

- Email and password form with validation
- JWT token stored for session persistence
- Redirect to dashboard on success
- Clear error message on invalid credentials

---

### Dev Login (Development Only)

**As a developer**, I want a "Dev Login" button on the login page that instantly logs me in as an admin, so I can skip typing credentials during development.

- "Dev Login" button visible only when the backend is running in development mode (`ENV=development` or `DEBUG=true`)
- Backend exposes a `GET /api/auth/dev-login` endpoint that returns a valid admin JWT — only available when `ENV != production`
- Frontend conditionally renders the button based on a `/api/metadata` flag (e.g., `dev_mode: true`)
- The button is **never** rendered or functional on production:
  - Backend rejects `/api/auth/dev-login` requests in production with `404 Not Found` (not `403`, to avoid leaking the endpoint exists)
  - Frontend metadata response omits `dev_mode` in production
- Button styled distinctly (e.g., dashed border, muted color) to make it visually obvious it's a dev shortcut
- Creates or reuses a seeded dev admin account (e.g., `dev@localhost`)

---

### View Dashboard

**As a user**, I want to see a summary dashboard when I log in, so I can quickly understand the current security posture of my networks.

- Total hosts, open ports, and active alerts at a glance
- Recent scan activity
- Quick links to networks, alerts, and scans

---

### Browse Hosts & Open Ports

**As a user**, I want to browse all discovered hosts and their open ports, so I can understand what is exposed on my network.

- Paginated host list with IP, hostname, and port count
- Click a host to see all its open ports, banners, and services
- First seen / last seen timestamps per port

---

### View Host Detail

**As a user**, I want to view a single host's full security profile, so I can assess its risk in one place.

- Open ports with service banners
- SSH security posture (auth methods, ciphers, version)
- Alert history for this host
- Applied port rules
- NSE vulnerability findings

---

### View Alerts

**As a user**, I want to see all active alerts in one list, so I can triage security issues.

- List of alerts sorted by severity
- Filter by type (new port, SSH, NSE, policy violation)
- Filter by severity (critical, high, medium, info)
- Filter by network

---

### Dismiss an Alert

**As a user**, I want to dismiss an alert with a reason, so resolved issues no longer clutter my alert queue.

- Dismiss button with required reason field
- Reason suggestions for common scenarios
- Dismissed alerts hidden from default view but still accessible

---

### Reopen a Dismissed Alert

**As a user**, I want to reopen a previously dismissed alert, so I can revisit issues that were closed prematurely.

- Reopen button on dismissed alerts
- Alert returns to the active queue

---

### Add a Comment to an Alert

**As a user**, I want to add comments to alerts, so I can document investigation notes and share context with my team.

- Free-text comment field on alert detail
- Comment history with author and timestamp

---

### Assign an Alert

**As a user**, I want to assign an alert to a team member, so responsibility for follow-up is clear.

- User picker dropdown on alert detail
- Assigned alerts filterable in the alert list

---

### Bulk Acknowledge Alerts

**As a user**, I want to select multiple alerts and acknowledge them at once, so I can efficiently clear known-good findings.

- Checkbox selection on alert rows
- Bulk accept globally or per-network
- Creates port rules to suppress future alerts for accepted ports

---

### View Scan History

**As a user**, I want to see a history of all scans, so I can track what was scanned, when, and what was found.

- Scan list with status (planned, running, completed, failed, cancelled)
- Filter by network and status
- Click to see scan detail with discovered ports and logs

---

### View Scan Logs

**As a user**, I want to view the raw logs of a scan, so I can troubleshoot failures or understand scanner behavior.

- Log viewer with timestamps
- Auto-scroll for in-progress scans

---

### Trigger a Manual Scan

**As a user**, I want to manually trigger a port scan on a network, so I can get fresh results on demand.

- "Scan Now" button on network detail
- Choose scan type (port scan or NSE vulnerability scan)
- Scan appears in scan history immediately

---

### Cancel a Running Scan

**As a user**, I want to cancel a scan that is in progress, so I can stop accidental or unnecessary scans.

- Cancel button on running scans
- Scan status updates to "cancelled"

---

### View Port Rules

**As a user**, I want to see all port rules (accepted and critical), so I know which ports are whitelisted or flagged across my networks.

- Global rules and per-network rules listed separately
- Rule type (accepted / critical), port, optional IP scope

---

### Create a Port Rule

**As a user**, I want to create a port rule to accept or mark a port as critical, so future scans generate the right alerts.

- Choose scope: global or specific network
- Set port number and rule type (accepted / critical)
- Optional IP restriction

---

### Delete a Port Rule

**As a user**, I want to delete a port rule that is no longer needed, so alert behavior stays up to date.

- Delete button with confirmation
- Removing an "accepted" rule re-enables alerts for that port

---

## NSE Script Library Stories

> NSE scripts are managed centrally in the backend. The backend can pull official `.nse`
> scripts from the Nmap project. Users can also upload or write custom scripts. Scanner
> agents pull scripts and profiles from the backend API before each scan.

### Import NSE Scripts from Nmap

**As an admin**, I want the backend to pull official `.nse` scripts from the Nmap project website/repository, so I have the latest vulnerability checks without manual downloads.

- Backend fetches scripts from the Nmap GitHub repository
- Import all scripts or select by category (vuln, auth, discovery, exploit, etc.)
- Store each script in the database: filename, source code, description, categories, author, CVEs referenced
- "Sync with Nmap" button in the UI to pull updates
- Show diff when an updated version is available: "http-vuln-cve2017-5638.nse — 3 lines changed"
- Track script version/hash to detect updates

---

### Browse NSE Script Library

**As a user**, I want to browse all available NSE scripts in a searchable library, so I can find the right checks for my needs.

- List of all scripts (imported from Nmap + custom uploaded)
- Search by name, description, or CVE ID
- Filter by category (vuln, auth, discovery, exploit, brute, dos, etc.)
- Filter by source: official Nmap vs. custom
- Script count and last sync timestamp shown

---

### View NSE Script Detail

**As a user**, I want to view the full detail of an NSE script, so I understand what it checks and how it works.

- Script source code with syntax highlighting (Lua)
- Parsed metadata: description, author, license, categories, CVEs
- Usage info: which profiles include this script
- Script arguments and their descriptions (parsed from `@args` in the source)

---

### Add a Custom NSE Script

**As a user**, I want to upload or write a custom `.nse` script, so I can check for vulnerabilities specific to my environment.

- Upload a `.nse` file or paste script source code in an editor
- Required fields: name, description, categories
- Optional: severity, target ports, script arguments
- Syntax validation before saving (basic Lua parse check)
- Custom scripts marked with a distinct badge to distinguish from official Nmap scripts

---

### Edit an NSE Script

**As a user**, I want to edit a custom NSE script's source code and metadata, so I can fix bugs or adjust behavior.

- In-browser code editor with Lua syntax highlighting
- Edit description, categories, severity, and arguments
- Official Nmap scripts are read-only — must clone to edit
- Save creates a new version (previous version preserved)

---

### Delete a Custom NSE Script

**As a user**, I want to delete a custom NSE script I no longer need, so the library stays clean.

- Delete button with confirmation
- Warning if the script is used in any profiles: "This script is used in 3 profiles. Remove from profiles first?"
- Cannot delete official Nmap scripts (only custom)

---

### Clone an NSE Script

**As a user**, I want to clone an official Nmap script to create a customized version, so I can modify it without losing the original.

- Clone button creates a copy marked as "custom"
- Editable source code and metadata
- Original remains untouched in the library

> **Status: Planned**

---

## NSE Profile Stories

> Profiles group multiple NSE scripts together for execution. Profiles are assigned to
> network scans so the same set of checks runs consistently.

### Browse NSE Profiles

**As a user**, I want to browse all NSE profiles, so I can choose the right set of checks for a scan.

- List of built-in and custom profiles
- Search by name
- Filter by severity, platform, and type (scan group vs. individual check)
- Show script count per profile

---

### View NSE Profile Detail

**As a user**, I want to see which scripts are included in a profile, so I understand what it checks.

- Script list with name, description, severity, and categories
- Link to view each script's source code
- Profile metadata: name, description, severity, platform

---

### Create an NSE Profile

**As a user**, I want to create a profile by selecting scripts from the library, so I can group related checks together.

- Name and description fields
- Script picker: searchable list of all available scripts with checkboxes
- Preview selected scripts before saving
- Set profile-level severity (or inherit per-script severity)
- Set target platform (Linux, Windows, All)

---

### Edit an NSE Profile

**As a user**, I want to edit a custom profile to add or remove scripts, so I can adjust checks as my needs change.

- Add/remove scripts from the profile
- Edit name, description, severity, platform
- Built-in profiles are read-only — must clone to edit

---

### Clone an NSE Profile

**As a user**, I want to clone any profile (built-in or custom), so I can use it as a starting point for a new one.

- Clone button creates an editable copy with "(Copy)" appended to the name
- All scripts from the source profile are included in the clone

---

### Delete a Custom NSE Profile

**As a user**, I want to delete a custom profile I no longer need, so my profile list stays clean.

- Delete button with confirmation
- Warning if the profile is assigned to any networks: "This profile is used by 2 networks. Unassign first?"
- Cannot delete built-in profiles

---

### Assign an NSE Profile to a Network Scan

**As a user**, I want to assign an NSE profile to a network, so scheduled scans automatically run the right vulnerability checks.

- Profile dropdown on network create/edit (shows scan group profiles only)
- Assigned profile used for all scheduled NSE scans on that network
- Override possible when triggering a manual scan

---

### Run an NSE Scan with a Profile

**As a user**, I want to run an NSE scan against a target using a selected profile, so I can check for vulnerabilities on demand.

- Select target network or specific IP
- Select NSE profile (required)
- Scan uses stored open ports from the inventory (no re-discovery)
- Results appear in NSE results list with script output, severity, and CVE IDs

---

### View NSE Results

**As a user**, I want to view NSE scan results, so I can see which vulnerabilities were detected.

- Results list filterable by scan, IP, port, severity, and CVE
- Script output detail per finding
- CVE IDs linked to external references (NVD, MITRE)
- Severity badge per result

---

## Scanner Script Distribution Stories

> Scanner agents run outside the backend (often at remote locations). They need the
> latest scripts and profile definitions before executing a scan. Scripts and profiles
> are pulled from the backend API, not bundled with the scanner.

### Scanner Pulls Scripts from Backend API

**As a scanner agent**, I want to pull the required NSE scripts from the backend API before a scan, so I always use the latest version without manual file deployment.

- Scanner calls `GET /api/scanner/scripts?profile_id=X` to get all scripts for a profile
- Backend returns script source code and metadata for each script in the profile
- Scanner writes scripts to a temporary directory for Nmap execution
- Scripts are fetched fresh before each scan (or cached with ETag/hash for efficiency)
- No manual script deployment to scanner hosts required

---

### Scanner Pulls Profile Definition from Backend API

**As a scanner agent**, I want to pull the full profile definition (script list, arguments, severity) from the backend API, so I know exactly what to execute.

- Scanner calls `GET /api/scanner/profiles/{id}` to get the profile
- Response includes: profile metadata, list of script names, per-script arguments, severity overrides
- Scanner uses this to construct the Nmap `--script` argument list

---

### Script Caching on the Scanner

**As a scanner agent**, I want to cache scripts locally and only re-download when they change, so I don't waste bandwidth on every scan.

- Scanner stores downloaded scripts with their content hash
- On next scan, sends hash to backend: `GET /api/scanner/scripts?profile_id=X&if_none_match=<hash>`
- Backend returns `304 Not Modified` if scripts haven't changed
- Full re-download only when scripts are added, updated, or removed

> **Status: Planned**

---

### Scanner Reports Missing Scripts

**As a scanner agent**, I want to report back to the backend when a script fails to execute or is missing, so the admin can see script issues in the dashboard.

- Scanner reports script execution errors as part of scan results
- Backend stores errors per script per scan
- Dashboard shows "Script Errors" tab on scan detail: script name, error message, host/port
- Helps identify broken or incompatible custom scripts

> **Status: Planned**

---

### View SSH Security Results

**As a user**, I want to see SSH security findings per host, so I can identify weak configurations.

- SSH version, auth methods, cipher list, key exchange algorithms
- Flags for weak ciphers, weak KEX, password auth enabled
- Per-network and global views

---

### Export SSH Compliance Report

**As a user**, I want to export an SSH compliance report as PDF, so I can share it with auditors or management.

- PDF download with SSH posture summary across all hosts
- Highlights weak configurations and recommendations

---

### View Trends

**As a user**, I want to see historical trend charts for open ports and alerts, so I can understand whether my security posture is improving or degrading over time.

- Line charts for port count and alert count over time
- Filterable by network and date range

---

### Switch Theme

**As a user**, I want to toggle between light and dark mode, so I can use the interface comfortably in any environment.

- Theme toggle in the UI
- Preference saved to my user profile

---

### Add a Comment to an Open Port

**As a user**, I want to add a note to a specific open port, so I can document why it's open or what action is planned.

- Free-text comment field on port detail
- Auto-populated when an alert is acknowledged with a reason

---

## Network & Scan Configuration Stories

### Create a Network with CIDR and Port Specification

**As a user**, I want to create a network by specifying a CIDR range (e.g., `5.81.27.0/24`) and a port specification (e.g., `1-2000,9000-9999`), so the system knows exactly which IPs and ports to scan.

- CIDR input with validation (IPv4 and IPv6)
- Port specification as comma-separated ranges: `22`, `80,443`, `1-1024`, `1-2000,8000-9999`
- Shortcut: `1-65535` for all ports
- Name field for labeling the network (e.g., "Production DMZ", "Office Berlin")
- CIDR and port spec stored in the database and passed to the scanner engine

---

### Create an IPv6 Network

**As a user**, I want to create networks with IPv6 CIDR ranges (e.g., `2001:db8::/48`), so I can monitor IPv6-enabled infrastructure.

- IPv6 CIDR input with validation
- Support for common IPv6 notations (full, compressed, mixed)
- Port specification works identically for IPv4 and IPv6
- IPv6 addresses displayed correctly throughout the UI (hosts, alerts, scan results)

---

### Edit a Network's Port Specification

**As a user**, I want to change a network's port specification after creation, so I can expand or narrow the scan scope without recreating the network.

- Edit port spec on network detail page
- Changes apply to the next scheduled or manual scan
- Previous scan results remain unchanged for historical comparison

---

### Validate Network Input

**As a user**, I want the system to validate my CIDR and port inputs immediately, so I catch typos before saving.

- Frontend validation: valid CIDR notation, valid port ranges (1-65535), no overlapping ranges
- Backend validation: reject invalid CIDR, reject ports outside 1-65535, reject malformed ranges
- Clear error messages: "Invalid CIDR: did you mean 5.81.27.0/24?" or "Port 70000 exceeds maximum 65535"

---

### Configure Scan Rate (Packets Per Second)

**As a user**, I want to set a scan rate in packets per second (pps) for each network, so I can control how aggressively the scanner probes and avoid overloading the target network or connection.

- PPS input field on network create/edit (e.g., 1000, 5000, 50000)
- Sensible defaults per engine: Masscan default 10000 pps, Nmap default 1000 pps, RustScan default 5000 pps
- Minimum and maximum bounds with validation (e.g., 10–1000000 pps)
- Warning when rate exceeds recommended threshold for the network size: "High scan rates on small subnets may trigger IDS alerts"
- Override per manual scan without changing the network default

---

### Estimate Scan Runtime

**As a user**, I want the UI to show an estimated scan duration based on the configured pps, number of IPs, and number of ports, so I can decide if the scan rate is reasonable before starting.

- Formula: `estimated_seconds = (number_of_ips × number_of_ports) / pps`
- Calculated live in the frontend as the user adjusts CIDR, port spec, or pps
- Displayed as human-readable duration: "~2 minutes", "~1 hour 15 minutes", "~3 days"
- Shown on: network create/edit form, manual scan trigger dialog, and next to scheduled scan preview
- Color-coded: green (<1h), yellow (1h–8h), red (>8h) to flag unreasonably long scans
- Accounts for the number of IPs in the CIDR (e.g., `/24` = 254 hosts, `/16` = 65534 hosts)
- Tooltip explaining the estimate: "254 IPs × 2000 ports ÷ 5000 pps = ~102 seconds"

---

### View Scan Rate During Execution

**As a user**, I want to see the actual scan rate (pps) while a scan is running, so I can verify the scanner is operating at the configured speed.

- Live pps metric reported by the scanner agent during execution
- Displayed on the scan detail page alongside progress
- Comparison: configured pps vs. actual pps
- Warning if actual rate deviates significantly from configured (e.g., network bottleneck)

---

### Scan Rate Presets

**As a user**, I want to pick from rate presets (Slow/Safe, Normal, Fast, Maximum) instead of typing a number, so I can quickly choose an appropriate speed without knowing the exact pps value.

- Presets with descriptions:
  - **Slow / Safe** (100 pps) — minimal network impact, suitable for production environments
  - **Normal** (1000 pps) — balanced speed and safety
  - **Fast** (10000 pps) — aggressive, suitable for lab/staging environments
  - **Maximum** (100000 pps) — full speed, use only on isolated networks
- Custom option for entering an exact pps value
- Preset selection also updates the runtime estimate in real time

---

### Schedule Recurring Scans with Crontab Syntax

**As a user**, I want to schedule recurring scans using crontab syntax (e.g., `0 2 * * *` for daily at 2 AM), so scans run automatically without manual intervention.

- Crontab expression input field on network configuration
- Human-readable preview: "Every day at 02:00 UTC"
- Preview of next 3 scheduled run times
- Common presets: hourly, daily, weekly, monthly
- Timezone selection (default UTC)
- Enable/disable schedule toggle without deleting the expression

---

### Pause and Resume Scheduled Scans

**As a user**, I want to pause a network's scheduled scans temporarily, so I can stop scanning during maintenance windows without losing the schedule configuration.

- Pause/resume toggle on network detail
- Paused networks show a visual indicator in the network list
- Resuming picks up from the next cron occurrence

---

### View Upcoming Scheduled Scans

**As a user**, I want to see a calendar or list of upcoming scheduled scans across all networks, so I know what will run and when.

- List of next N scheduled scans with network name, time, and scanner
- Filter by network or scanner location
- Visual indicator for paused schedules

---

### View Live Scan Rate

**As a user**, I want to see the actual scan rate (pps) while a scan is running, so I can verify the scanner is operating at the configured speed.

- Live pps metric reported by the scanner agent during execution
- Displayed on the scan detail page alongside progress
- Masscan: actual rate parsed from stdout
- Nmap: estimated rate from elapsed time and progress
- Rate formatted with SI suffixes (e.g., "8.2k pps")

---

### View Scan Estimate in Quick Scan Modal

**As a user**, I want to see the estimated scan duration when triggering a quick scan, so I can decide if the scan is reasonable before starting.

- Estimated runtime shown after selecting a network
- Displays IP count, port count, and configured pps
- Color-coded duration: green (<1h), yellow (1-8h), red (>8h)
- Tooltip with detailed breakdown

---

## Open Port Inventory & Reuse Stories

> Discovered open ports are persisted in the database. Subsequent scanners (NSE, Greenbone,
> SSH probes) reuse the stored `ip:port` combinations instead of re-scanning from scratch.

### Store Discovered Open Ports

**As a user**, I want all discovered open ports to be stored in the database with their IP, port, protocol, banner, and service guess, so I have a persistent inventory of what is exposed.

- Each open port record: IP, port, protocol (TCP/UDP), banner, service guess, first seen, last seen
- Deduplicated across scans — same `ip:port:protocol` updates the existing record
- `last_seen_at` updated on every scan that rediscovers the port
- Ports not seen in a new scan are kept but flagged as potentially closed

---

### Discover Hostnames on First Contact

**As a user**, I want the scanner to automatically discover possible hostnames for each IP when it is first seen, so I can identify what's running on a host without manual lookups.

- Runs automatically on first discovery of a new IP (not on every scan)
- Sources checked (in order, all results merged):
  - **Reverse DNS (PTR)** — standard reverse lookup for the IP
  - **SSL/TLS certificates** — extract CN (Common Name) and SAN (Subject Alternative Names) from certs on open HTTPS/TLS ports
  - **HTTP Host headers** — parse `Server` header and HTML `<title>` from HTTP banners
  - **SMTP/FTP banners** — extract hostnames from service greeting banners
  - **HELO/EHLO** — hostname from SMTP handshake if port 25/587 is open
- All discovered hostnames stored on the host record with their source (e.g., `ptr`, `ssl_cn`, `ssl_san`, `banner`)
- Primary hostname auto-selected: PTR > SSL CN > banner (user can override)
- Displayed on host list and host detail page next to the IP
- Searchable — users can search hosts by hostname, not just IP

---

### Re-Discover Hostnames on Demand

**As a user**, I want to manually trigger hostname re-discovery for a host, so I can refresh the hostnames when DNS or certificates have changed.

- "Refresh hostnames" button on host detail page
- Re-runs all discovery sources against current open ports
- Updates stored hostnames, marks removed ones as stale
- Timestamp of last hostname discovery shown

---

### View Hostname Sources

**As a user**, I want to see where each hostname was discovered from (PTR, SSL cert, banner), so I can judge how trustworthy the mapping is.

- Hostname list on host detail with source badge per entry
- Multiple hostnames per host supported (e.g., PTR says `mail.example.com`, SSL SAN includes `smtp.example.com` and `imap.example.com`)
- Source icons/badges: DNS, SSL, Banner

---

### Hostname Change Alerts

**As a user**, I want to be alerted when a host's discovered hostnames change between scans, so I can detect DNS hijacking, certificate changes, or infrastructure moves.

- Alert type: `hostname_changed`
- Triggered when hostnames differ from previous discovery
- Alert detail shows: old hostnames, new hostnames, which source changed
- Severity: info (by default, configurable)

> **Status: Planned**

---

### View Port Staleness

**As a user**, I want to see which ports are stale (not found in the latest scan), so I can distinguish between currently open and historically open ports.

- Ports not seen in the latest completed scan of their network are flagged as "Stale"
- Stale label shown as a badge next to the port number
- Stale rows are visually dimmed (lower opacity)
- Filter toggle: All / Active Only / Stale Only on the Global Ports view
- Staleness computed at query time from last_seen_at vs latest scan timestamp

---

### Reuse Open Ports for NSE Scans

**As a user**, I want NSE vulnerability scans to use the stored open port inventory instead of re-discovering ports, so NSE scans are faster and targeted.

- NSE scan reads `ip:port` pairs from the database for the target network
- No port discovery phase needed — scripts run directly against known open ports
- Option to filter which ports to check (e.g., only web ports 80/443/8080 for web NSE profiles)
- If no stored ports exist yet, show a warning: "Run a port scan first"

---

### Reuse Open Ports for Greenbone Scans

**As a user**, I want Greenbone vulnerability scans to use stored open ports as a target list, so assessments focus on actual attack surface.

- Pass known `ip:port` combinations to Greenbone as the scan target
- Reduces scan time by skipping port discovery
- Greenbone runs NVT checks only against ports known to be open

> **Status: Planned**

---

### Reuse Open Ports for SSH Probes

**As a user**, I want SSH security probes to automatically target ports where an SSH service was detected, so I don't have to manually specify SSH ports.

- SSH probe reads ports with `service_guess = 'ssh'` or known SSH ports (22, 2222, etc.) from the inventory
- Runs SSH auth/cipher/version checks against those ports
- Works for non-standard SSH ports discovered during scanning

---

### Mark a Port as Closed

**As a user**, I want ports that are no longer detected in subsequent scans to be flagged as "last seen on [date]", so I can distinguish between currently open and historically open ports.

- Port record retains full history but shows staleness
- "Last seen" timestamp prominently displayed
- Filter: show only currently open ports vs. all historical ports
- Optional auto-archival after N days of not being seen

> **Status: Partially implemented** — ports are flagged as stale, but auto-archival after N days is not yet built.

---

### View Global Open Port Inventory

**As a user**, I want to see a deduplicated list of all open ports across all networks, so I have a single pane of glass for the entire attack surface.

- Global port table: IP, port, protocol, service, banner, first seen, last seen, networks where seen
- Search and filter by IP, port, service, or network
- Export as CSV

---

### View Open Ports for a Single Host

**As a user**, I want to see all open ports for a specific host, so I can assess that host's exposure.

- Host detail page shows all ports with banners, services, and last seen timestamps
- Linked alerts and NSE findings per port
- SSH security detail if SSH port is open

---

### Set a Custom Hostname for a Host

**As a user**, I want to manually set or override the hostname of an IP, so I can use a meaningful name when the auto-discovered hostname is wrong, missing, or unclear.

- Editable hostname field on host detail page (inline edit or edit modal)
- User-set hostname takes priority over auto-discovered hostnames
- Original discovered hostnames are preserved and still visible
- Badge or indicator showing "user-defined" vs. "auto-discovered"
- Hostname displayed throughout the UI wherever the IP appears (host list, alerts, scan results)

---

### Add Comments to a Host

**As a user**, I want to add comments to a host (IP), so I can document what it is, who owns it, or any notes relevant to the security team.

- Free-text comment field on host detail page
- Multiple comments supported as a thread (not just a single note)
- Each comment shows author, timestamp, and content
- Comments are persistent — they survive across scans
- Markdown support for formatting (links, code blocks, lists)
- Use cases: "This is the legacy mail server, decommission planned Q3", "Owned by DevOps team, contact @alice"

---

### Edit and Delete Host Comments

**As a user**, I want to edit or delete my own comments on a host, so I can correct mistakes or remove outdated information.

- Edit button on own comments
- Delete button with confirmation
- Admins can delete any comment
- Edit history preserved (shows "edited" label with timestamp)

---

### Host Activity Timeline

**As a user**, I want to see a chronological timeline of everything that has happened to a host, so I can understand its full history at a glance.

- Single timeline on host detail page showing all events in chronological order:
  - **Port events** — port first seen, port closed (no longer detected), port reopened
  - **Scan events** — scans that included this host, with engine type and result summary
  - **Alert events** — alerts created, dismissed, reopened, assigned
  - **NSE findings** — vulnerabilities detected or resolved
  - **SSH changes** — auth method changes, cipher changes, version upgrades/downgrades
  - **Hostname changes** — hostnames discovered, changed, or manually overridden
  - **Comments** — user comments added, edited, or deleted
  - **Port rule changes** — rules created or removed affecting this host
- Filterable by event type (ports, alerts, scans, comments, etc.)
- Infinite scroll or paginated (oldest events may go back months)
- Each entry shows: timestamp, event type icon, description, and acting user (if applicable)

---

### Export Host History

**As a user**, I want to export a host's full history as CSV or PDF, so I can share it with auditors, management, or other teams.

- Export button on host detail page
- CSV: one row per event with timestamp, type, and description
- PDF: formatted report with host summary, open ports, alert history, and timeline
- Date range filter for the export

---

### Host Summary Card

**As a user**, I want the host detail page to show a summary card at the top with key info at a glance, so I don't have to scroll through the timeline for basics.

- IP address and hostname (user-defined or auto-discovered)
- Number of open ports (current)
- Active alerts count by severity
- SSH security status (secure / issues found)
- NSE vulnerability count
- First seen / last seen dates
- Networks this host belongs to
- Quick actions: refresh hostnames, trigger scan, add comment

---

## IPv6 Support Stories

> The platform supports both IPv4 and IPv6 throughout the stack: frontend display,
> backend storage, API validation, and scanner engines (where the engine supports it).

### Store and Display IPv6 Addresses

**As a user**, I want IPv6 addresses to be stored and displayed correctly throughout the application, so IPv6 hosts are first-class citizens.

- Database columns use appropriate types for IPv6 (e.g., `VARCHAR(45)` or native INET type)
- UI displays IPv6 addresses in compressed notation (e.g., `2001:db8::1`)
- Copy-to-clipboard works for IPv6 addresses
- All tables, filters, and search fields accept IPv6

---

### Scan IPv6 Networks

**As a user**, I want to scan IPv6 CIDR ranges when the scanner engine supports it, so I can discover open ports on IPv6 hosts.

- Scanner capability report includes IPv6 support flag per engine
- Nmap: full IPv6 support (`-6` flag)
- Masscan: IPv6 support
- RustScan, Naabu: IPv6 if supported by engine version
- Greenbone: IPv6 scan targets
- UI shows a warning if the assigned scanner engine does not support IPv6

---

### IPv6 Connectivity Check

**As a user**, I want the scanner to verify IPv6 connectivity before starting an IPv6 scan, so I get a clear error instead of a silent failure.

- Scanner checks IPv6 reachability before executing
- Clear error message if IPv6 is not available at the scanner location
- Scan status set to "failed" with reason "No IPv6 connectivity"

---

### Mixed IPv4/IPv6 Networks

**As a user**, I want to create separate network entries for IPv4 and IPv6 ranges of the same infrastructure, so I can scan both and compare results.

- No restriction on mixing — create `192.168.1.0/24` and `2001:db8:1::/64` as two networks
- Host detail page shows ports from both IPv4 and IPv6 scans if the host has dual-stack
- Alerts generated independently for each protocol family

---

### Filter and Search by IP Version

**As a user**, I want to filter hosts, ports, and alerts by IPv4 or IPv6, so I can focus on one protocol family at a time.

- IP version filter on hosts, alerts, and scan results pages
- Filter options: All, IPv4 only, IPv6 only

---

## Advanced User Stories

### Real-Time Scan Dashboard

**As a security analyst**, I want to see live scan progress with a real-time port discovery feed, so I can watch threats emerge as they're found instead of waiting for the scan to complete.

- Live WebSocket feed showing ports as they're discovered
- Animated network topology map that lights up hosts as they're scanned
- "Threat pulse" indicator showing scan velocity and finding rate

> **Status: Planned**

---

### Smart Alert Correlation

**As a security analyst**, I want alerts to be automatically correlated across scans and hosts, so I can see attack patterns like "3 hosts on subnet X all exposed EternalBlue in the last 24 hours" without manually cross-referencing.

- Automatic grouping of related alerts (same CVE across hosts, same host with multiple CVEs)
- Timeline view showing alert clusters
- "Campaign" detection — flag when multiple hosts show the same vulnerability profile

> **Status: Planned**

---

### Host Risk Score

**As a security analyst**, I want each host to have a computed risk score based on open ports, SSH weaknesses, CVE severity, and alert history, so I can prioritize remediation by actual risk instead of scrolling through flat lists.

- Composite score (0-100) combining: port exposure, CVE CVSS scores, SSH posture, unresolved alert count
- Risk trend sparkline on host cards
- Sortable/filterable host list by risk score
- "Top 10 Riskiest Hosts" widget on the dashboard

> **Status: Planned**

---

### Scan Diff & Change Detection

**As a security analyst**, I want to compare any two scans side-by-side and see exactly what changed (new ports, closed ports, new vulnerabilities, resolved issues), so I can quickly assess network drift after maintenance windows or incidents.

- Visual diff view: green (new), red (removed), yellow (changed)
- Filterable by change type
- "What changed since last scan?" one-click shortcut on network pages

---

### Custom Alert Rules Engine

**As a security analyst**, I want to define custom alert rules like "alert me if port 3389 (RDP) appears on any host outside the admin VLAN" or "critical alert if any host has more than 5 high-severity CVEs", so monitoring adapts to my organization's specific policies.

- Rule builder UI with conditions (port, protocol, CVE score, host range, time window)
- AND/OR logic combinators
- Test rule against historical data before activating
- Slack/email/webhook notification targets per rule

> **Status: Planned**

---

### Vulnerability Remediation Tracker

**As a security analyst**, I want to assign CVEs to team members with due dates and track remediation progress, so vulnerability management has a clear workflow from detection to closure.

- Assign CVE findings to users with priority and due date
- Kanban board: Open → In Progress → Remediated → Verified
- Re-scan verification — auto-close tickets when CVE no longer detected
- SLA tracking with overdue indicators

> **Status: Planned**

---

### Scheduled Report Delivery

**As a security analyst**, I want to schedule weekly/monthly PDF reports delivered to my email covering new findings, remediation progress, and risk trend, so stakeholders stay informed without manual effort.

- Report template builder (select sections: executive summary, new CVEs, host risk changes, SSH posture)
- Cron-based scheduling with email delivery
- PDF and CSV attachment options
- Distribution lists per report

> **Status: Planned**

---

## Core Admin Stories

### Create a User

**As an admin**, I want to create new user accounts with an email and password, so team members can access the platform.

- Form with email, password, and role selection
- Password validation (minimum length, complexity)
- User receives access immediately after creation

---

### Assign Roles to Users

**As an admin**, I want to assign a role to each user, so I can control access levels based on job responsibilities.

- Role dropdown on user creation and edit forms
- **Admin**: full read/write access to all features
- **Operator**: can trigger scans, manage networks, dismiss alerts
- **Analyst**: can view and triage alerts, add comments
- **Viewer**: read-only access

---

### Edit a User

**As an admin**, I want to edit an existing user's email or role, so I can update access when responsibilities change.

- Edit form pre-filled with current values
- Role changes take effect on the user's next request

---

### Delete a User

**As an admin**, I want to delete a user account, so former team members no longer have access.

- Delete button with confirmation prompt
- Cannot delete your own account

---

### View All Users

**As an admin**, I want to see a list of all users with their roles, so I know who has access to the platform.

- User table with email, role, and creation date
- Quick actions: edit, delete

---

### Create a Network

**As an admin**, I want to create a network definition with a name, CIDR range, and port specification, so the system knows what to scan.

- Form with name, CIDR, port range, protocol (TCP/UDP/both)
- Assign to a scanner agent
- Set scan schedule (cron expression)
- Select default NSE profile for vulnerability scans

---

### Edit a Network

**As an admin**, I want to edit a network's configuration, so I can adjust scan targets, schedules, and alert settings.

- Edit form with all network fields
- Changes apply to the next scheduled scan

---

### Delete a Network

**As an admin**, I want to delete a network I no longer need to monitor, so it stops generating scans and alerts.

- Delete button with confirmation
- Associated scan history remains for audit purposes

---

### Configure Network Alert Settings

**As an admin**, I want to configure which alert types are enabled per network, so I can suppress noise on networks where certain findings are expected.

- Toggle alert types (new port, not allowed, SSH checks, NSE checks)
- Per-network configuration

---

### Set Excluded Ports on a Network

**As an admin**, I want to exclude specific ports from alerting on a network, so known-good services don't generate noise.

- Excluded port list per network
- Optional IP-specific exclusions

---

### Register a Scanner

**As an admin**, I want to register a new scanner agent, so it can start picking up scan jobs.

- Create scanner with a name
- Generate API key (shown once, then hashed)
- Scanner uses the key to authenticate and poll for jobs

---

### View Scanner Status

**As an admin**, I want to see which scanners are online and when they last checked in, so I know my scanning infrastructure is healthy.

- Scanner list with name, last seen timestamp, and version
- Visual indicator for online/offline status

---

### Delete a Scanner

**As an admin**, I want to remove a scanner that is no longer in use, so the scanner list stays accurate.

- Delete button with confirmation
- Pending jobs for this scanner are not automatically reassigned

---

### Generate Scanner API Key

**As an admin**, I want to generate an API key for a scanner, so it can authenticate with the backend securely.

- API key displayed once after generation
- Key is bcrypt-hashed and stored securely
- Old key is invalidated when a new one is generated

---

### Delete a Host

**As an admin**, I want to delete a host record, so I can remove decommissioned hosts from the inventory.

- Delete button on host detail
- Removes the host and its associated open port records

---

### Schedule Recurring Scans

**As an admin**, I want to set a cron schedule on a network, so scans run automatically at regular intervals.

- Cron expression field on network edit
- Preview of next scheduled run time
- Scans created automatically by the scheduler

---

### Assign a Default NSE Profile to a Network

**As an admin**, I want to assign a default NSE profile to a network, so scheduled vulnerability scans use the right checks automatically.

- NSE profile dropdown on network edit (shows scan group profiles only)
- Used when the network's scheduled scan triggers an NSE scan

---

## Distributed Scanner Architecture

> Scanners are lightweight agents deployed at different locations (offices, data centers,
> cloud regions). They connect **outbound** to the central dashboard over HTTP(S) — no
> inbound ports required at the scanner site. The backend is **FastAPI + MariaDB**.

### Deploy a Scanner at a Remote Location

**As an admin**, I want to deploy a scanner agent at a remote site that connects back to the central dashboard via HTTP, so I can monitor networks behind firewalls and NATs without exposing inbound ports.

- Scanner initiates all connections outbound to the central API (no inbound firewall rules needed)
- Scanner authenticates with its API key on every request
- Works behind NAT, corporate proxies, and restrictive firewalls
- Only requires HTTPS access to the central dashboard URL

---

### Assign a Location to a Scanner

**As an admin**, I want to assign a location label (e.g., "HQ Berlin", "AWS eu-west-1", "Branch Office Tokyo") to each scanner, so I can see at a glance where my scanning infrastructure is deployed.

- Location field on scanner registration and edit
- Location displayed in scanner list, scan history, and alert context
- Filter networks, scans, and alerts by scanner location

---

### Route Networks to Specific Scanners

**As an admin**, I want to assign a network to a specific scanner, so scans run from the correct location that has connectivity to the target CIDR.

- Scanner dropdown on network create/edit
- Only scanners that are online and at the appropriate location should be suggested
- A network can only be assigned to one scanner at a time

---

### Scanner Heartbeat & Health Monitoring

**As an admin**, I want the central dashboard to track each scanner's heartbeat, so I know immediately when a remote scanner goes offline.

- Scanner sends periodic heartbeat (configurable interval, default 60s) via HTTP POST
- Dashboard shows last seen timestamp and online/offline indicator
- Alert generated when a scanner misses heartbeats beyond a threshold
- Heartbeat includes: scanner version, OS, available scanner engines, uptime, job queue depth

---

### Scanner Job Polling

**As a scanner agent**, I want to poll the central API for pending scan jobs, so I can execute them locally and report results back.

- Scanner polls `GET /api/scanner/jobs` at a configurable interval
- Claims a job atomically (prevents double-execution by another scanner)
- Executes the scan locally using the specified scanner engine
- Reports results back via `POST /api/scanner/results`
- Updates job status: planned → running → completed/failed

---

### Scanner Result Submission

**As a scanner agent**, I want to submit scan results (open ports, banners, NSE findings, SSH details) to the central API in a single atomic request, so results are consistent and alerts are generated server-side.

- Single POST with all findings for a scan
- Backend processes results, generates alerts, updates host inventory
- Transaction-safe: all-or-nothing commit
- Scanner receives confirmation or error with retry guidance

---

### View Scans by Scanner Location

**As a user**, I want to filter scan history by scanner location, so I can see what was scanned from each site.

- Location filter on scans page
- Scan detail shows which scanner and location executed the scan

---

### Cross-Location Port Comparison

**As a user**, I want to see if a host's open ports differ when scanned from different locations, so I can detect firewall misconfigurations or split-horizon scenarios.

- Compare results from two scanners targeting the same host
- Highlight ports visible from one location but not another
- Useful for verifying firewall rules and segmentation

> **Status: Planned**

---

## Pluggable Scanner Engine Architecture

> The scanner agent supports multiple scan engines via a **plugin/adapter pattern**.
> Each engine implements a common interface. New engines can be added without modifying
> existing code. The backend stores the engine type per scan for result attribution.

### Common Scanner Engine Interface

**As a developer**, I want all scanner engines to implement a common interface, so adding a new engine requires only writing an adapter without changing the core scanner or backend.

- Common interface: `execute(target, port_spec, options) → ScanResult`
- `ScanResult` contains: discovered ports, banners, service guesses, raw output, duration
- Engine registration via a registry/plugin pattern
- Backend stores `engine_type` on each scan record for attribution

---

### Nmap Engine

**As a user**, I want to scan with Nmap, so I get accurate service detection, OS fingerprinting, and script execution.

- Service version detection (`-sV`)
- OS fingerprinting (`-O`)
- Configurable scan speed and timing templates
- TCP and UDP support
- XML output parsing for structured results

---

### Masscan Engine

**As a user**, I want to scan with Masscan, so I can discover open ports across large networks at high speed.

- Millions of packets per second for fast initial discovery
- Configurable rate limiting (packets/sec)
- TCP SYN scan
- Best for wide CIDR ranges where speed matters more than service detail

---

### RustScan Engine

**As a user**, I want to scan with RustScan, so I get fast port discovery with automatic Nmap handoff for service detection.

- Ultra-fast initial port discovery
- Configurable batch size and timeout
- Optional automatic handoff to Nmap for service detection on found ports
- Adaptive scanning that adjusts speed based on network conditions

> **Status: Planned**

---

### Naabu Engine

**As a user**, I want to scan with Naabu (ProjectDiscovery), so I get a fast, reliable Go-based port scanner with SYN/CONNECT scan options.

- SYN and CONNECT scan modes
- Host discovery with ping probes
- Configurable rate and retries
- CDN/WAF detection and exclusion
- JSON output parsing

> **Status: Planned**

---

### Greenbone / OpenVAS Engine

**As a user**, I want to scan with Greenbone (OpenVAS), so I get a full vulnerability assessment with a comprehensive CVE database.

- Integration with Greenbone Community Edition or Enterprise
- Scanner agent communicates with local Greenbone instance via GMP (Greenbone Management Protocol)
- NVT (Network Vulnerability Test) feed for up-to-date CVE checks
- Results mapped to the common ScanResult format with CVE IDs and CVSS scores
- Supports authenticated scans (SSH, SMB, SNMP credentials)

> **Status: Planned**

---

### NSE Script Engine

**As a user**, I want to run targeted NSE (Nmap Scripting Engine) scripts against specific hosts and ports, so I can check for known vulnerabilities like EternalBlue, Heartbleed, or Shellshock.

- Select from built-in or custom NSE profiles
- Execute specific scripts against targeted hosts
- Parse script output for vulnerability indicators and CVE IDs
- Results include severity, script output, and extracted CVEs
- Independent from full Nmap scans — can run NSE-only checks

---

### Select Scanner Engine per Network

**As an admin**, I want to choose which scanner engine to use for each network, so I can pick the right tool for the job.

- Engine dropdown on network create/edit (Nmap, Masscan, RustScan, Naabu, Greenbone)
- Engine availability depends on what is installed on the assigned scanner agent
- Default engine configurable per scanner

---

### Select Scanner Engine per Scan

**As a user**, I want to override the scanner engine when triggering a manual scan, so I can use a different tool for a one-off scan without changing the network config.

- Engine selector on manual scan trigger
- Dropdown shows only engines available on the target scanner
- Does not change the network's default engine

---

### Scanner Engine Capability Reporting

**As an admin**, I want each scanner agent to report which engines are installed and available, so the dashboard knows what scan types can be routed where.

- Scanner heartbeat includes list of available engines with versions
- Dashboard shows engine availability per scanner
- Network engine selection is validated against scanner capabilities
- Warning when assigning a network to a scanner that lacks the required engine

---

### Add a New Scanner Engine (Developer)

**As a developer**, I want to add a new scanner engine by implementing the common interface and registering it, without modifying the core scanner code or database schema.

- Create a new adapter implementing `ScannerEngine` interface
- Register in the engine registry with a unique type identifier
- Engine automatically appears in heartbeat capability reports
- Backend accepts results from any registered engine type
- No database migration required — `engine_type` is a string field

---

### Engine-Specific Configuration

**As an admin**, I want to set engine-specific options (e.g., Masscan rate, Nmap timing template, RustScan batch size) per network or per scan, so I can tune scanner behavior.

- JSON options field per network for engine-specific config
- Defaults provided by each engine adapter
- Override per manual scan trigger
- Options validated by the engine adapter before scan starts

---

### Unified Results Regardless of Engine

**As a user**, I want scan results to look the same regardless of which engine produced them, so I don't need to learn different result formats.

- All engines produce the same `ScanResult` structure
- Open ports, banners, and services displayed identically in the UI
- Engine type shown as a badge/label on scan records for attribution
- Alerts generated from the same pipeline regardless of engine source

---

## Advanced Admin Stories

### Multi-Tenant Organization Support

**As an admin**, I want to create isolated organizations/teams within the platform, each with their own networks, scanners, and users, so I can serve multiple business units or clients from a single deployment.

- Organization CRUD with isolated data boundaries
- Users belong to one or more orgs
- Scanners assigned per org
- Cross-org admin view for platform operators

> **Status: Planned**

---

### Role-Based Access Control (RBAC) with Granular Permissions

**As an admin**, I want to define custom roles beyond admin/viewer (e.g., "Network Owner", "SOC Analyst", "Auditor") with fine-grained permissions per resource, so access matches actual job responsibilities.

- Custom role definitions with permission sets (scan:execute, alert:dismiss, network:edit, user:manage, report:export)
- Network-scoped roles — "Alice is admin for Production but viewer for Dev"
- Audit log of all permission-sensitive actions
- Role templates for common security team structures

> **Status: Planned**

---

### Scanner Fleet Management

**As an admin**, I want a dedicated scanner management dashboard showing health, version, capacity, and job queue per scanner, so I can ensure scanning infrastructure is healthy and optimally loaded.

- Scanner health dashboard with heartbeat monitoring, uptime %, and version info
- Job queue depth and throughput metrics per scanner
- Auto-alerting when a scanner misses heartbeats
- One-click scanner upgrade/restart (via agent command channel)
- Load balancing recommendations ("Scanner-2 is idle, Scanner-1 has 15 queued jobs")

> **Status: Planned**

---

### API Key Lifecycle Management

**As an admin**, I want to manage API key rotation, expiration policies, and usage auditing, so scanner credentials follow security best practices automatically.

- Key expiration dates with configurable policies (30/60/90 days)
- Rotation workflow: generate new key → grace period → old key expires
- Usage audit: last used timestamp, request count, source IPs
- Emergency revocation with immediate effect
- Email notifications before key expiry

> **Status: Planned**

---

### System-Wide Audit Log

**As an admin**, I want a comprehensive audit log of all user actions (logins, alert dismissals, rule changes, scan triggers, user management), so I can satisfy compliance requirements and investigate incidents.

- Immutable append-only log with timestamp, user, action, target resource, and IP
- Searchable and filterable by user, action type, date range
- Export to SIEM (syslog/JSON format)
- Retention policy configuration

> **Status: Planned**

---

### Integration Hub

**As an admin**, I want to configure outbound integrations (Slack, PagerDuty, Jira, SIEM, webhooks) so alerts and findings flow into existing operational tools without manual copy-paste.

- Integration catalog with setup wizards
- Per-integration filtering (only send critical CVEs to PagerDuty, all alerts to SIEM)
- Test connection / send test alert button
- Delivery status and retry queue visibility

> **Status: Planned**

---

### Backup & Disaster Recovery

**As an admin**, I want automated database backups with one-click restore and export/import of all configuration (networks, rules, profiles, users), so I can recover from failures or migrate between environments.

- Scheduled encrypted backups to S3/local storage
- Configuration export as versioned JSON bundle
- Import/restore wizard with dry-run preview
- Backup health monitoring and alerting on failures

> **Status: Planned**
