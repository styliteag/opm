# Planned Features — User Stories

> Completed features have been moved to [COMPLETED-FEATURES.md](./COMPLETED-FEATURES.md).

## 1. Slack / Webhook Notifications
**As a** network security engineer, **I want to** receive alert notifications via Slack or a custom webhook, **so that** I get instant alerts in the tools I already use, without relying solely on email.

**Implementing:** no
**Current state:** Only SMTP email notifications exist. No Slack, Teams, PagerDuty, or generic webhook integration.

---

## 2. Maintenance Windows / Alert Suppression
**As an** administrator, **I want to** define maintenance windows for specific networks or hosts, **so that** planned changes (e.g., deploying new services) don't generate a flood of false-positive alerts.

**Implementing:** no
**Current state:** No concept of maintenance windows or temporary alert suppression. Every scan generates alerts regardless of context.

---

## 3. Host Tagging & Grouping
**As a** security analyst, **I want to** tag hosts with labels (e.g., "production", "database", "web-server", "critical") and filter/group by tags, **so that** I can organize and prioritize my inventory beyond just network membership.

**Implementing:** yes
**Current state:** Hosts only have a free-text `user_comment` field and are grouped by network. No tagging or custom grouping system exists.

---

## 4. Scheduled Report Delivery
**As a** compliance manager, **I want to** schedule weekly or monthly PDF/CSV reports to be automatically emailed to stakeholders, **so that** I don't have to manually export and send reports every time.

**Implementing:** no
**Current state:** PDF/CSV exports exist but are manual only. No scheduled or automated report delivery.

---

## 5. Audit Log
**As an** administrator, **I want to** see an audit trail of all user actions (who acknowledged an alert, who changed a network config, who triggered a scan), **so that** I have accountability and can investigate who did what and when.

**Implementing:** yes
**Current state:** No audit logging. Actions like alert acknowledgment, network changes, and scan triggers are not tracked by user.

---

## 6. Two-Factor Authentication (2FA)
**As a** security-conscious user, **I want to** protect my account with TOTP-based two-factor authentication, **so that** even if my password is compromised, my monitoring dashboard remains secure.

**Implementing:** no
**Current state:** Authentication is email/password with JWT only. No MFA/2FA support.

---

## 7. Service Version Change Tracking
**As a** security analyst, **I want to** be alerted when a service version changes on a host (e.g., Apache 2.4.51 → 2.4.58, or an unexpected service appears), **so that** I can detect unauthorized software updates or new deployments.

**Implementing:** yes
**Current state:** Partially implemented. Nmap captures `service_guess` and `banner` per port, and SSH version tracking exists, but there is no alerting or historical tracking for non-SSH service version changes.

---

## 8. SIEM / Ticketing System Integration
**As a** SOC analyst, **I want to** automatically forward alerts to my SIEM (e.g., Splunk, Elastic) or create tickets in Jira/ServiceNow, **so that** port monitor findings feed into my existing incident response workflow.

**Implementing:** no
**Current state:** No syslog output, no SIEM-compatible event format (CEF/LEEF), and no ticketing system integration. Alerts live only within the app.

---

## 9. Custom Dashboard / Saved Views
**As a** team lead responsible for multiple network segments, **I want to** create saved filter presets or custom dashboard views showing only the networks and alert types I care about, **so that** I don't have to re-apply filters every time I open the app.

**Implementing:** no
**Current state:** The dashboard is fixed for all users. Alert filters must be manually set each session. No saved views, bookmarks, or per-user dashboard customization.

---

## 10. Scan Baseline & Deviation Detection
**As a** network security engineer, **I want to** define a "known-good baseline" of expected open ports per host or network, and be alerted only when the current state deviates from this baseline, **so that** I reduce alert noise and focus on actual anomalies.

**Implementing:** no
**Current state:** Partially implemented via port rules (allow/block lists), but there is no per-host baseline concept. The current system alerts on global/network rules, not on a per-host "expected state." A host running 5 known services will always trigger `new_port` alerts after a gap, even if nothing changed.

---

## 11. Host Baseline & Deviation Detection
**As a** network security engineer, **I want to** define a "known-good baseline" of expected open ports per host, and be alerted only when the current state deviates from this baseline, **so that** I reduce alert noise and focus on actual anomalies. I want to able to defien a baseline as for example "webserver" or "database" and assign which ports are expected to be open.

**Implementing:** no
**Current state:** Partially implemented via port rules (allow/block lists), but there is no per-host baseline concept. The current system alerts on global/network rules, not on a per-host "expected state." A host running 5 known services will always trigger `new_port` alerts after a gap, even if nothing changed.

---

## 12. Alert Escalation Rules
**As a** security operations manager, **I want to** define escalation rules that automatically escalate unacknowledged alerts after a configurable time period (e.g., re-notify after 1h, escalate to a senior after 4h), **so that** critical alerts never go unnoticed.

**Implementing:** no
**Current state:** Alerts have acknowledgment and assignment, but there is no time-based escalation. An unacknowledged alert stays silently in the list forever until someone manually acts on it.

---

## 13. SSL/TLS Certificate Expiry Monitoring
**As a** system administrator, **I want to** be alerted when SSL/TLS certificates on monitored hosts are approaching expiry (e.g., 30/14/7 days), **so that** I can renew them before they cause outages.

**Implementing:** yes
**Current state:** The scanner already extracts SSL certificate data via nmap's `ssl-cert` script during hostname enrichment, but the certificate expiry date is not stored, tracked, or alerted on.

---

## 14. Network Topology / Host Map Visualization
**As a** network engineer, **I want to** see a visual map of discovered hosts grouped by network/subnet, **so that** I can quickly understand the layout and spot anomalies (unexpected hosts, isolated systems).

**Implementing:** yes
**Current state:** Hosts are presented in flat, sortable tables. There is no graphical or topological visualization of the network structure.

---

## 15. API Access Tokens for External Automation
**As a** DevOps engineer, **I want to** generate long-lived API tokens scoped to read-only or specific actions, **so that** I can integrate Onyx Port Monitor data into my CI/CD pipelines, scripts, or monitoring dashboards without using my personal credentials.

**Implementing:** no
**Current state:** Authentication is JWT-based with user login sessions only. There are no personal access tokens, service accounts, or API keys for external consumers (scanner API keys exist but are internal).

---

## 16. Alert Deduplication & Correlation
**As a** security analyst, **I want to** have related alerts automatically grouped together (e.g., 50 `new_port` alerts from the same scan on the same subnet shown as one incident), **so that** I can triage efficiently instead of wading through hundreds of individual alerts.

**Implementing:** yes
**Current state:** Each alert is an independent record. A single scan that discovers 100 new ports creates 100 separate alerts with no grouping, correlation, or incident concept.

---

## 17. Host Availability / Uptime Tracking
**As a** network administrator, **I want to** see a history of when hosts were reachable (pingable) and when they went offline, **so that** I can track uptime patterns and detect hosts that disappear or reappear unexpectedly.

**Implementing:** yes
**Current state:** Hosts have a `is_pingable` boolean and `last_seen_at` timestamp, but there is no historical timeline of availability. Only the current state is stored — previous up/down transitions are lost.

---

## 18. Role-Based Access Per Network
**As an** administrator of a multi-team organization, **I want to** restrict users to only see and manage specific networks (e.g., Team A sees only their production network, Team B sees only their staging network), **so that** each team has visibility scoped to their responsibility.

**Implementing:** no
**Current state:** All authenticated users see all networks. The role system only distinguishes between admin (full access) and viewer (read-only), with no per-network or per-team scoping.

---

## ~~19. Vulnerability Correlation (CVE Lookup)~~ — COMPLETED

Moved to [COMPLETED-FEATURES.md](./COMPLETED-FEATURES.md).

---

## 20. Configuration Backup & Restore
**As an** administrator, **I want to** export and import the full system configuration (networks, port rules, alert settings, scanner configs) as a file, **so that** I can back up my setup, migrate to a new instance, or replicate configurations across environments.

**Implementing:** no
**Current state:** Network and rule configurations can only be created through the UI or API one by one. There is no bulk export/import for the entire system configuration. Only port rules support CSV import per network.

---

## 21. Closed Port / Disappeared Service Alerts
**As a** security engineer, **I want to** be alerted when a previously open port is no longer detected (service disappeared), **so that** I can investigate whether a critical service went down or was intentionally decommissioned.

**Implementing:** yes
**Current state:** Alerts only fire for newly appearing ports (`new_port`) or policy violations. There is no alert type for ports that were previously open but are now closed — services can silently disappear without notification.

---

# Alert Workflow — User Stories

## 24. "My Alerts" — Personal Alert Queue
**As an** assigned analyst, **I want to** see a dedicated "My Alerts" view showing only alerts assigned to me, sorted by severity and age, **so that** I know exactly what I'm responsible for and can work through my queue efficiently.

**Implementing:** no
**Current state:** Assignment exists (`assigned_to_user_id`) and the Alerts page can filter by assignee, but there is no dedicated personal queue, no quick-access "My Alerts" in the navigation, and no count badge showing how many alerts are waiting for me.

---

## 25. Assignment Notification
**As a** team member, **I want to** be notified (via email and/or in-app) when an alert is assigned to me or when someone comments on an alert I'm assigned to, **so that** I don't have to constantly check the dashboard to know when I have new work.

**Implementing:** no
**Current state:** Assignment is silent. When an admin assigns an alert to a user, there is no notification of any kind. The assignee only discovers it by browsing the Alerts page. Comments on alerts also generate no notifications.

---

## 26. Bulk Triage Actions
**As a** security team lead doing morning triage, **I want to** select multiple alerts and in one action: assign them all to a team member, set their status to "In Progress", and add a triage comment (e.g., "Assigned to Bob — investigate new services on DMZ"), **so that** I can process a batch of related alerts in seconds instead of clicking through each one individually.

**Implementing:** no
**Current state:** Bulk acknowledge exists, and bulk whitelist exists, but there is no bulk assignment, no bulk status change, and no bulk comment. Each of these actions must be performed one alert at a time via the Alerts page inline dropdowns.

---

## 27. Alert Snooze / Remind Later
**As a** security analyst, **I want to** snooze an alert for a defined period (e.g., 24h, 1 week, until next scan), **so that** I can temporarily hide alerts I've seen but can't act on right now, without losing track of them — they automatically reappear when the snooze expires.

**Implementing:** no
**Current state:** The only way to hide an alert is to acknowledge it, which is permanent (until manually reopened). There is no temporary suppression. Analysts either leave noisy alerts visible or acknowledge them and risk forgetting to follow up.

---

## 28. Resolution Reason Required on Close
**As a** compliance manager, **I want** a resolution reason to be mandatory when marking an alert as "Resolved" (e.g., "Service decommissioned", "Added to allowlist", "False positive — scanner artifact"), **so that** we have a documented justification for every closed alert for audit purposes.

**Implementing:** no
**Current state:** Resolution status can be set to "resolved" with no reason or comment. Acknowledgment supports an optional reason, but resolution does not. There is no enforcement and no distinction between "resolved because fixed" vs "resolved because whitelisted" vs "resolved because ignored."

---

## 29. Alert Status Change Audit Trail
**As an** administrator, **I want to** see a timeline of all status changes on an alert (who changed it, from what to what, when), **so that** I can understand the full history of how an alert was handled and hold team members accountable.

**Implementing:** no
**Current state:** Only comments provide a partial history. Status changes (open → in_progress → resolved), assignment changes, and acknowledgment/unacknowledgment are not logged. If someone resolves an alert, there is no record of who did it or when.

---

## 30. Alert SLA / Response Time Tracking
**As a** security operations manager, **I want to** define SLA targets per severity level (e.g., Critical: respond within 1h, High: within 4h, Medium: within 24h) and see which alerts are approaching or breaching their SLA, **so that** I can ensure timely response and report on team performance.

**Implementing:** no
**Current state:** Alerts have `created_at` timestamps but no SLA definitions, no breach tracking, no time-to-acknowledge or time-to-resolve metrics. There is no way to measure or report on alert response performance.

---

## 31. In-App Alert Count Badge & Real-Time Updates
**As a** user with the dashboard open, **I want to** see a live count of unacknowledged alerts in the navigation bar (e.g., a red badge on "Alerts" showing "12"), updating in real-time as new alerts come in or are acknowledged, **so that** I always know the current alert load without navigating to the alerts page.

**Implementing:** no
**Current state:** Alert counts are only visible after navigating to the Alerts page. The navigation bar shows no indicator of pending alerts. There is no WebSocket or polling mechanism for real-time alert count updates in the nav bar.

---

## 32. Alert Grouping by Incident
**As a** security analyst, **I want to** group related alerts into an "Incident" (e.g., "Unauthorized services detected on DMZ hosts 2026-03-01"), add a shared description, and track/resolve the incident as a unit, **so that** I can manage a coordinated response to related findings instead of treating each alert in isolation.

**Implementing:** no
**Current state:** Each alert is independent. When a scan discovers 50 new ports across 10 hosts, it creates 50 individual alerts with no grouping. The analyst must mentally correlate them. There is no incident/case concept, no way to link alerts together, and no shared resolution tracking.

---

# Agent-Based Detection — User Stories

## 33. Host Agent for Local Vulnerability Detection
**As a** security engineer, **I want to** install a lightweight agent on target hosts that checks local configuration, file contents, and installed software versions against vulnerability detection templates, **so that** I can detect misconfigurations and vulnerabilities that are invisible from network scans alone (e.g., weak SSH config, missing disk encryption, exposed credentials).

**Implementing:** no
**Current state:** All vulnerability detection is network-based via nmap NSE scripts. There is no agent that runs on target machines. Local checks like "is PermitRootLogin set to yes in sshd_config" or "are SSH private keys world-readable" require host-level access that network scanning cannot provide.

**Reference:** Three detection types:
- **file-content** — regex matching against config files (e.g., sshd_config, nginx.conf)
- **file-hash** — detecting known-vulnerable software by file hash (e.g., Apache binaries)
- **version-cmd** — running local commands to check system state (e.g., `csrutil status` for SIP, `fdesetup status` for FileVault)

---

## 34. Agent Template Repository & Sync
**As an** administrator, **I want to** manage agent detection templates from a git-based repository (similar to NSE script repositories), **so that** I can version-control, share, and update detection rules across all agents without redeploying.

**Implementing:** no
**Current state:** The NSE template repository system exists for network-based scripts but has no equivalent for agent-based detection templates. Agent templates would use YAML format with structured detection steps (file paths, regex patterns, commands) rather than `.nse` scripts.

**Template format example:**
```yaml
id: SSH-001
info:
  name: SSH Root Login Enabled
  vulnerability_id: CWE-250
  severity: high
  description: "Detects SSH servers configured to allow direct root login."
  tags: [ssh, misconfiguration, hardening]
  remediation: "Set 'PermitRootLogin no' in /etc/ssh/sshd_config"
detection:
  logic: any
  steps:
    - name: "Check sshd_config for PermitRootLogin yes"
      type: file_content
      platforms: [linux, darwin]
      config:
        path: "/etc/ssh/sshd_config"
        regex: "^\\s*PermitRootLogin\\s+(yes|without-password)"
```

---

## 35. Agent Registration & Management
**As an** administrator, **I want to** register, monitor, and manage host agents from the Onyx Port Monitor dashboard, **so that** I can see which hosts have agents installed, their last check-in time, agent version, and health status.

**Implementing:** no
**Current state:** The scanner agent model exists for network scanners but not for host-level agents. A host agent system would need: agent registration with API keys, heartbeat/check-in tracking, template distribution, result collection, and agent version management.

---

## 36. Agent Detection Categories
**As a** security analyst, **I want** agent-based detection templates organized into categories, **so that** I can enable/disable entire categories per host or group.

**Implementing:** no
**Current state:** No agent detection system exists. Planned categories:
- **SSH hardening** — root login, password auth, weak ciphers/MACs, empty passwords
- **OS security** — SIP disabled (macOS), Gatekeeper, FileVault, firewall status
- **File permissions** — world-writable /etc, SSH keys readable, sudoers writable
- **Credential exposure** — plaintext git credentials, AWS keys, Docker config auth tokens
- **Software versions** — outdated packages with known CVEs via file hash or version commands
