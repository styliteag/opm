# Planned Features — User Stories

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
**As a** DevOps engineer, **I want to** generate long-lived API tokens scoped to read-only or specific actions, **so that** I can integrate Open Port Monitor data into my CI/CD pipelines, scripts, or monitoring dashboards without using my personal credentials.

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

## 19. Vulnerability Correlation (CVE Lookup)
**As a** security analyst, **I want to** automatically cross-reference detected services and versions against known CVE databases, **so that** I can see which hosts are running vulnerable software without manually looking up each service.

**Implementing:** no
**Current state:** Nmap captures service names and version strings, but there is no CVE database integration. Analysts must manually cross-reference detected versions with vulnerability databases.

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

## 22. Quick ACK with Reusable Comments & Port-Aware Suggestions
**As a** security analyst, **I want to** quickly acknowledge an open port alert by choosing from comments I've previously used (e.g., "Known web server", "Approved monitoring agent"), with suggestions prioritized by matching port number (e.g., port 443 suggests previous "HTTPS – expected" comments first), **so that** I can triage alerts faster without retyping the same justifications over and over.

**Implementing:** yes
**Current state:** Acknowledging an alert requires manually typing a comment each time. There is no history of previous comments, no autocomplete, and no port-aware suggestion logic. Repeated acknowledgments for the same type of finding (e.g., port 22 across many hosts) require the same text to be entered from scratch every time.

---

# Alert Workflow — User Stories

## 23. Open Port Alert Lifecycle: From Detection to ACK
**As a** security admin (often the sole operator), **I want** a streamlined workflow for handling open port alerts — **Detection → Review → ACK with reason → Done** — where acknowledging an alert automatically propagates my comment to the corresponding open port entry, **so that** I can quickly work through new findings and every acknowledged port carries a documented justification visible everywhere that port appears.

**The workflow should work like this:**

1. **Detection**: A scan completes, new or policy-violating open ports generate alerts. Duplicates are suppressed while an existing unacknowledged alert for the same IP:port is still open.
2. **Notification**: Alerts are sent to configured recipients (email, future: webhook). The notification includes severity, host, port, service name, and a direct link.
3. **Review**: The admin reviews open alerts in the Risk Overview or Alerts page, filters by severity/network/type, and inspects the findings. They can view host details, service banners, and scan history for context.
4. **ACK with reason**: The admin acknowledges the alert and provides a reason (e.g., "Known web server", "Approved monitoring port"). The reason is:
   - Stored as the alert's `ack_reason`
   - Automatically written to the corresponding **open port's comment** (so the justification is visible on the Hosts page, Host Detail, and Open Ports views)
   - Suggested from previously used reasons, prioritized by matching port number (see Story #22)
5. **Whitelist (optional)**: If the port is permanently expected, the admin can whitelist it globally or per-network in the same action, preventing future alerts.
6. **Done**: Acknowledged alerts move to the "Acknowledged" view. They remain searchable for audit. They can be reopened if needed.

**Assignment to other users is optional** — it exists for larger teams but the core workflow assumes a single admin handling alerts directly. The focus is on making the ACK flow as fast and useful as possible.

**Key behavior — ACK reason propagates to open port comment:**
When an open port alert is acknowledged with a reason, that reason should automatically be set as the `user_comment` on the matching `GlobalOpenPort` record (and optionally on the `Host` comment if empty). This way, the Hosts page and Open Ports page show *why* a port was accepted, not just that it exists.

**Implementing:** done
**Current state:** The building blocks exist (alert types, acknowledgment with reason, comments, whitelisting) but the ACK reason does NOT propagate to the open port entry. Acknowledging a `new_port` alert with a global_open_port_id already copies the reason to `GlobalOpenPort.user_comment`, but network-scoped alerts and the host-level port view don't receive this information. The workflow works but requires the admin to document the same justification in multiple places manually.

---

## 24. "My Alerts" — Personal Alert Queue
**As an** assigned analyst, **I want to** see a dedicated "My Alerts" view showing only alerts assigned to me, sorted by severity and age, **so that** I know exactly what I'm responsible for and can work through my queue efficiently.

**Implementing:** no
**Current state:** Assignment exists (`assigned_to_user_id`) and the RiskOverview page can filter by assignee, but there is no dedicated personal queue, no quick-access "My Alerts" in the navigation, and no count badge showing how many alerts are waiting for me.

---

## 25. Assignment Notification
**As a** team member, **I want to** be notified (via email and/or in-app) when an alert is assigned to me or when someone comments on an alert I'm assigned to, **so that** I don't have to constantly check the dashboard to know when I have new work.

**Implementing:** no
**Current state:** Assignment is silent. When an admin assigns an alert to a user, there is no notification of any kind. The assignee only discovers it by browsing the Risk Overview page. Comments on alerts also generate no notifications.

---

## 26. Bulk Triage Actions
**As a** security team lead doing morning triage, **I want to** select multiple alerts and in one action: assign them all to a team member, set their status to "In Progress", and add a triage comment (e.g., "Assigned to Bob — investigate new services on DMZ"), **so that** I can process a batch of related alerts in seconds instead of clicking through each one individually.

**Implementing:** no
**Current state:** Bulk acknowledge exists, and bulk whitelist exists, but there is no bulk assignment, no bulk status change, and no bulk comment. Each of these actions must be performed one alert at a time via the RiskOverview inline dropdowns.

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
**Current state:** Alert counts are only visible after navigating to the Alerts or Risk Overview page. The navigation sidebar shows no indicator of pending alerts. There is no WebSocket or polling mechanism for real-time alert count updates in the nav bar.

---

## 32. Alert Grouping by Incident
**As a** security analyst, **I want to** group related alerts into an "Incident" (e.g., "Unauthorized services detected on DMZ hosts 2026-03-01"), add a shared description, and track/resolve the incident as a unit, **so that** I can manage a coordinated response to related findings instead of treating each alert in isolation.

**Implementing:** no
**Current state:** Each alert is independent. When a scan discovers 50 new ports across 10 hosts, it creates 50 individual alerts with no grouping. The analyst must mentally correlate them. There is no incident/case concept, no way to link alerts together, and no shared resolution tracking.

---

## 33. Extend with new Scanners and Alert Types
**As a** Programmer, **I want to** extend the system with new scanners and alert types, **so that** I can add new scanner types and other types of alerts.

Example of new scanner types:
- Censys
- Hunter

**Implementing:** done
**Current state:** Partially implemented. Alert types are enum-based and relatively easy to extend manually (add enum value + generation logic + frontend constant). Scanner types are hardcoded to masscan/nmap with a job-polling architecture that doesn't accommodate API-based scanners like Censys/Hunter. No plugin, registry, or adapter pattern exists for either scanners or alert types.

---

## 34. Unified Open Port + SSH Security Workflow
**As a** security administrator, **I want to** manage open port alerts and SSH security findings for the same host in one place, **so that** when I discover an open SSH port I can review its security posture (authentication methods, ciphers, version) and acknowledge it in a single workflow — whether the port is expected and secure, expected but insecure, or unexpected entirely.

**The workflow should cover three real-world scenarios:**

1. **Expected SSH port, secure configuration** (e.g., a jump host running OpenSSH 9.x with publickey-only auth and strong ciphers):
   - The `new_port` alert for port 22 appears in Risk Overview.
   - The admin sees the SSH security summary inline (auth method, cipher strength, version) without navigating to a separate page.
   - They ACK the open port alert with a reason like "Production jump host — SSH expected" and optionally whitelist it. Done in one action.

2. **Expected SSH port, insecure configuration** (e.g., a legacy server with password auth enabled and weak ciphers):
   - Both a `new_port` alert and SSH security findings (insecure auth, weak ciphers) exist for the same host.
   - The admin sees the SSH findings alongside the open port alert — they understand the port is expected but the configuration needs fixing.
   - They ACK the SSH security findings with a reason like "Legacy system — password auth required until migration Q3" to suppress noise, while leaving the open port alert acknowledged separately. Both actions are accessible from a single host view.

3. **Unexpected SSH port** (e.g., port 2222 appears on a web server that shouldn't have SSH):
   - A `new_port` alert fires for port 2222. The SSH security scan reveals it's running an outdated OpenSSH with keyboard-interactive auth.
   - The admin sees both the unexpected port and the SSH security findings together, immediately understanding the severity.
   - They investigate, then either remediate (close the port) or ACK both the open port and SSH findings if it turns out to be authorized.

**Key requirements:**
- SSH security status (auth methods, cipher strength, version) should be visible from the Risk Overview or Host Detail page, not only on the separate SSH Security page.
- Acknowledging an open SSH port should surface related SSH findings and offer to ACK them in the same action.
- Conversely, the SSH Security page should show whether the port itself is already acknowledged as an expected open port.
- A single "host security summary" view should consolidate open port status, SSH findings, and acknowledgment state.

**Implementing:** partial
**Current state:** Open port alerts are managed from Risk Overview, and SSH security findings are managed from the SSH Security page (`/ssh-security`). Both have independent ACK workflows — the SSH Security page now supports acknowledge/unacknowledge with the same 3-option modal (acknowledge only, accept everywhere, accept in this network). However, these are two separate pages with no cross-references. An admin handling an open SSH port must visit Risk Overview to ACK the `new_port` alert, then navigate to SSH Security to review and ACK the SSH findings. There is no unified view showing both aspects together, and acknowledging in one place does not inform or link to the other.

---

# UX Simplification — User Stories

> The stories below address a core usability problem: the system splits related security information across 5 pages (Hosts, Open Ports, Risk Overview, SSH Security, Port Rules) with no clear workflow connecting them. A user must constantly hop between pages to understand and act on what the scanner found. These stories aim to consolidate the experience into a clear, linear workflow.

---

## 35. Host-Centric Security Summary (Single Host, Full Picture)
**As a** security admin, **I want** the Host Detail page to be my **single pane of glass** for everything about one host — open ports, alerts, SSH findings, port rules, and comments — **so that** I never need to visit 4 separate pages to understand one host's security posture.

**What the Host Detail page should show:**

1. **Port table** — all open ports for this host, each row showing:
   - Port, protocol, service name/banner
   - Rule status: "Accepted" / "Critical" / "No rule" (with the reason from Port Rules inline)
   - Alert status: "New" / "Acknowledged" / "No alert" (with ACK reason inline)
   - SSH badge: if it's an SSH port, show auth method + cipher strength + version right in the row
   - Action buttons: ACK alert, create/edit port rule, add comment — all inline, no page navigation

2. **Alert section** — all alerts for this host (port alerts + SSH alerts) in one list, filterable by status. Same ACK/comment actions as Risk Overview, but scoped to this host.

3. **SSH detail panel** — if the host has SSH ports, show the full SSH security breakdown (ciphers, KEX, auth methods, version history) as a collapsible section, not on a separate page.

4. **Applied rules** — list of port rules that match this host (global + network-specific), so the user can see what's already whitelisted without going to Port Rules.

**Key behavior:**
- Clicking a host IP anywhere in the app (Risk Overview, Open Ports, SSH Security) should navigate to this Host Detail page.
- All triage actions (ACK, create rule, assign, comment) should be possible from this page.

**Implementing:** no
**Current state:** Host Detail shows basic host info, open ports list, and user comments. Alerts, SSH findings, and port rules are on entirely separate pages. There is no consolidated security view for a single host.

---

## 36. Simplified Navigation (Fewer Pages, Clearer Hierarchy)
**As a** user, **I want** a simpler navigation that groups related things together, **so that** I don't have to guess which of 5 pages has the information I need.

**Proposed navigation restructure:**

```
Current (9 nav items):              Proposed (6 nav items):
─────────────────────               ────────────────────────
Dashboard                           Dashboard
Scanners                            Scanners
Networks                            Networks
Scans                               Hosts & Ports  ← merged
Hosts                                 └ Host Detail ← the new single pane of glass (#35)
Risk Overview                       Alerts         ← renamed, subsumes Risk Overview + SSH alerts
Trends                                └ Alert Detail
SSH Security                        Trends
Port Rules
Users (admin)                       Users (admin)
```

**Key changes:**
1. **Merge "Hosts" + "Open Ports"** into one "Hosts & Ports" page. Open ports are already a property of hosts — they don't need their own top-level page. The existing Hosts page with its expandable rows showing ports is the right starting point; enrich it with port rule status and alert indicators.

2. **Merge "Risk Overview" + "SSH Security"** into one "Alerts" page. SSH findings are just another alert type — they shouldn't be on a separate page. The Risk Overview already supports SSH alert types via the toggle; make SSH alerts first-class citizens in the same list with SSH detail shown inline in the expanded row.

3. **Remove "Port Rules" as a top-level page.** Port rules are a configuration/settings concern, not a daily workflow page. Move it to:
   - A sub-section of a Settings/Admin area, OR
   - An "active rules" panel accessible from the Alerts page and Host Detail page
   - Keep the ability to create rules inline from wherever you're triaging (Alert row → "Accept this port" creates the rule)

4. **Remove "Scans"** as a top-level page. Scan status and history are already partially shown on Dashboard and Networks. Move scan details to a sub-page of Networks (each network shows its scan history).

**Implementing:** no
**Current state:** Navigation has 9+ items including separate pages for Hosts, Open Ports, Risk Overview, SSH Security, and Port Rules. Users must learn the distinction between all of them and mentally map which page holds which information.

---

## 37. Guided First-Time Triage Workflow
**As a** new user seeing alerts for the first time, **I want** a clear, guided flow that walks me through: **"Here's what was found → Here's what it means → Here's what to do"** — **so that** I can triage alerts without needing to understand the system's page structure first.

**The flow (all within the Alerts page):**

1. **See the problem** — Alert list shows what the scanner found, sorted by severity. Each row has enough context to understand the finding: IP, port, service, what triggered the alert, and severity. No need to navigate elsewhere.

2. **Understand the context** — Expanding an alert row shows:
   - Host info (hostname, networks, last scan)
   - Service detail (banner, SSH config if SSH port)
   - Matching port rules (if any)
   - Previous ACK history on this IP:port (if acknowledged before)
   - Related alerts on the same host (e.g., if there's also an SSH finding)

3. **Take action** — From the expanded row, the user can:
   - **"Accept & Dismiss"** — ACK with reason + create an ACCEPTED port rule in one click. This means "I expect this port, don't alert me again."
   - **"Acknowledge"** — ACK with reason but no rule. This means "I've seen it and it's fine for now, but alert me if it changes."
   - **"Mark Critical"** — Create a CRITICAL rule. This means "This port should NOT be open, escalate it."
   - **"Assign"** — Hand it to someone else to investigate.

4. **See the result** — After action, the alert moves to the appropriate filter tab. The port rule (if created) is immediately visible on the Host Detail page.

**Key behavior:**
- The user never leaves the Alerts page during triage. Everything they need to decide is shown inline.
- The three action buttons map directly to the mental model: "OK and expected" / "OK for now" / "Not OK."
- After a triage session, the user can visit Host Detail (#35) for a per-host deep dive if needed, but the Alerts page is the daily driver.

**Implementing:** no
**Current state:** Triage requires hopping between Risk Overview (to see alerts), SSH Security (to check SSH config), Host Detail (to see other ports on the same host), Port Rules (to create a whitelist rule), and Open Ports (to see the global port picture). There is no guided flow and the expanded alert row in Risk Overview doesn't show enough context to make a decision without navigating away.

---

## 38. Inline Port Rule Management (Create Rules Where You Work)
**As an** admin triaging alerts, **I want to** create, view, and edit port rules directly from the alert row or host detail — without navigating to the Port Rules page — **so that** whitelisting or blacklisting a port is a one-click action during triage, not a separate administrative task.

**What this means:**

1. **From any alert row** (on the Alerts page):
   - "Accept this port" button → creates an ACCEPTED rule for this IP:port (with scope choice: global or per-network) and ACKs the alert in one action.
   - "Mark critical" button → creates a CRITICAL rule.
   - If a rule already exists for this port, show it inline with an "Edit" link.

2. **From Host Detail** (#35):
   - Each port row shows its current rule status. Clicking the status opens an inline editor to create/modify/delete the rule.
   - A "Bulk accept" action for selecting multiple ports and creating rules at once.

3. **Port Rules page becomes a reference/admin page**, not a daily workflow page:
   - Still exists for bulk management, CSV import, and audit.
   - Demoted from top-level nav to a Settings sub-page or a link from the Alerts page header.

**Key behavior:**
- Creating a rule from an alert automatically acknowledges the alert and sets the ACK reason to the rule's description.
- Deleting a rule triggers re-evaluation: if the port is still open and no longer matches an ACCEPTED rule, a new alert is generated on the next scan.

**Implementing:** partial
**Current state:** Risk Overview has a "Whitelist" action that creates port rules, but it opens a separate modal and doesn't show existing rules. The Port Rules page is a standalone top-level page that feels disconnected from the triage workflow. Host Detail doesn't show port rule status at all.

---

## 39. SSH as a Port Enrichment, Not a Separate World
**As a** user, **I want** SSH security information to appear **as context on the port** (port 22, 2222, etc.) rather than on a completely separate page — **so that** I don't have to mentally connect "the SSH Security page says port 22 on 10.0.0.5 has weak ciphers" with "the Risk Overview says 10.0.0.5 has a new_port alert on port 22."

**What this means:**

1. **On the Alerts page**: When expanding an alert for an SSH port, show the SSH security summary (auth methods, cipher strength, version, config changes) inline in the expanded row. The user sees the port alert and the SSH posture together.

2. **On Host Detail** (#35): SSH ports in the port table show an SSH badge with key facts (auth method, cipher grade). Clicking expands the full SSH detail (cipher list, KEX, host keys, version history) inline.

3. **SSH-specific alert types** (`ssh_insecure_auth`, `ssh_weak_cipher`, etc.) appear in the main Alerts list alongside port alerts, not on a separate page. They show the same inline SSH detail when expanded.

4. **The standalone SSH Security page becomes optional/advanced**: It remains as a "fleet-wide SSH audit" view for users who specifically want to see all SSH hosts across all networks filtered by cipher/auth issues. But it's no longer required for daily triage — the Alerts page and Host Detail cover the common workflow.

5. **Global SSH alert settings** (thresholds for what triggers alerts) move to a Settings/Admin area, not on the SSH Security page.

**Implementing:** no
**Current state:** SSH security has its own dedicated top-level page (`/ssh-security`) with its own filtering, ACK workflow, and settings. It's completely disconnected from the port alert workflow. A user triaging a `new_port` alert on port 22 has no SSH context in the Risk Overview and must navigate to `/ssh-security` to see if the SSH config is secure.