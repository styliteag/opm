# TODO — Unimplemented User Stories

Features documented in [USERSTORYS.md](USERSTORYS.md) that are not yet built.

## Scanner Engines

- [ ] **RustScan Engine** — Fast port discovery with automatic Nmap handoff for service detection
- [ ] **Naabu Engine** — Go-based port scanner with SYN/CONNECT scan options (ProjectDiscovery)
- [ ] **Greenbone / OpenVAS Engine** — Full vulnerability assessment with GMP integration and NVT feed

## NSE Script Management

- [ ] **Clone an NSE Script** — Clone an official Nmap script to create a customized editable copy
- [ ] **Script Caching on the Scanner** — Cache scripts locally with content hash, use ETag/304 to avoid re-downloading unchanged scripts
- [ ] **Scanner Reports Missing Scripts** — Report script execution errors per scan, show "Script Errors" tab on scan detail

## Port & Host Management

- [ ] **Port Auto-Archival** — Automatically archive ports not seen after N days (staleness flagging is done, auto-archival is not)
- [ ] **Hostname Change Alerts** — Alert type `hostname_changed` when discovered hostnames differ between scans
- [ ] **Reuse Open Ports for Greenbone Scans** — Pass stored `ip:port` combinations to Greenbone as scan targets

## Advanced Analytics

- [ ] **Real-Time Scan Dashboard** — Live WebSocket feed showing ports as discovered, animated topology map, threat pulse indicator
- [ ] **Smart Alert Correlation** — Automatic grouping of related alerts, timeline view, campaign detection across hosts
- [ ] **Host Risk Score** — Composite score (0-100) combining port exposure, CVE CVSS, SSH posture, alert history
- [ ] **Custom Alert Rules Engine** — Rule builder UI with conditions, AND/OR logic, test against historical data, notification targets
- [ ] **Scan Diff from Multiple Locations** — Compare open ports when scanned from different scanner locations to detect firewall misconfigurations

## Workflow & Reporting

- [ ] **Vulnerability Remediation Tracker** — Assign CVEs to team members with due dates, Kanban board, re-scan verification, SLA tracking
- [ ] **Scheduled Report Delivery** — Cron-based weekly/monthly PDF reports with template builder, email delivery, distribution lists

## Platform / Enterprise

- [ ] **Multi-Tenant Organization Support** — Isolated organizations with their own networks, scanners, and users; cross-org admin view
- [ ] **Granular RBAC** — Custom role definitions with fine-grained permissions per resource, network-scoped roles
- [ ] **Scanner Fleet Management** — Dedicated health dashboard with heartbeat monitoring, job queue metrics, load balancing recommendations
- [ ] **API Key Lifecycle Management** — Key expiration policies, rotation workflow, usage audit, emergency revocation
- [ ] **System-Wide Audit Log** — Immutable append-only log of all user actions, searchable, exportable to SIEM
- [ ] **Integration Hub** — Outbound integrations (Slack, PagerDuty, Jira, SIEM, webhooks) with per-integration filtering
- [ ] **Backup & Disaster Recovery** — Automated encrypted backups, config export/import, restore wizard with dry-run
