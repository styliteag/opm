# Completed Features — User Stories

Features that have been implemented and shipped. Moved here from [PLANNED-FEATURES.md](./PLANNED-FEATURES.md).

---

## 22. Quick ACK with Reusable Comments & Port-Aware Suggestions
**As a** security analyst, **I want to** quickly acknowledge an open port alert by choosing from comments I've previously used (e.g., "Known web server", "Approved monitoring agent"), with suggestions prioritized by matching port number (e.g., port 443 suggests previous "HTTPS – expected" comments first), **so that** I can triage alerts faster without retyping the same justifications over and over.

**Implemented:** AckSuggestions component fetches previous ACK reasons from the API, prioritizes suggestions matching the current port number, and renders an autocomplete dropdown in the AckModal. Used in both the Alerts page and Host Detail alert section.

---

## 23. Open Port Alert Lifecycle: From Detection to ACK
**As a** security admin (often the sole operator), **I want** a streamlined workflow for handling open port alerts — **Detection → Review → ACK with reason → Done** — where acknowledging an alert automatically propagates my comment to the corresponding open port entry, **so that** I can quickly work through new findings and every acknowledged port carries a documented justification visible everywhere that port appears.

**The workflow should work like this:**

1. **Detection**: A scan completes, new or policy-violating open ports generate alerts. Duplicates are suppressed while an existing unacknowledged alert for the same IP:port is still open.
2. **Notification**: Alerts are sent to configured recipients (email, future: webhook). The notification includes severity, host, port, service name, and a direct link.
3. **Review**: The admin reviews open alerts in the Alerts page, filters by severity/network/type, and inspects the findings. They can view host details, service banners, and scan history for context.
4. **ACK with reason**: The admin acknowledges the alert and provides a reason. The reason is stored as `ack_reason`, automatically written to the corresponding open port's comment, and suggested from previously used reasons prioritized by matching port number.
5. **Whitelist (optional)**: If the port is permanently expected, the admin can whitelist it globally or per-network in the same action, preventing future alerts.
6. **Done**: Acknowledged alerts move to the "Acknowledged" view. They remain searchable for audit. They can be reopened if needed.

**Implemented:** Full lifecycle works end-to-end. ACK reason propagates to `GlobalOpenPort.user_comment`. Three-option AckModal (acknowledge only, accept globally, accept per-network) available from both Alerts page and Host Detail.

---

## 33. Extend with new Scanners and Alert Types
**As a** Programmer, **I want to** extend the system with new scanners and alert types, **so that** I can add new scanner types and other types of alerts.

Example of new scanner types:
- Censys
- Hunter

**Implemented:** Alert types are enum-based and extensible. Scanner types support masscan/nmap with a job-polling architecture. Censys/Hunter scanner adapters were added.

---

## 34. Unified Open Port + SSH Security Workflow
**As a** security administrator, **I want to** manage open port alerts and SSH security findings for the same host in one place, **so that** when I discover an open SSH port I can review its security posture (authentication methods, ciphers, version) and acknowledge it in a single workflow — whether the port is expected and secure, expected but insecure, or unexpected entirely.

**The workflow should cover three real-world scenarios:**

1. **Expected SSH port, secure configuration**: The admin sees the SSH security summary inline in the alert row and Host Detail port table. They ACK the open port alert and optionally whitelist it — done in one action.
2. **Expected SSH port, insecure configuration**: Both open port and SSH findings are visible together on the same page. The admin can ACK both from the Host Detail page.
3. **Unexpected SSH port**: The alert row shows SSH security findings inline, so the admin immediately sees both the unexpected port and the SSH posture.

**Implemented:** SSH security is shown inline on both the Alerts page (expanded row) and Host Detail (EnrichedPortTable SSH badges + collapsible SSHSecuritySection). The AckModal offers to ACK related SSH findings in the same action. The standalone SSH Security page was removed.

---

# UX Simplification — User Stories (Completed)

> These stories addressed a core usability problem: the system split related security information across 5 pages (Hosts, Open Ports, Risk Overview, SSH Security, Port Rules) with no clear workflow connecting them. They consolidated the experience into a host-centric workflow with two primary surfaces.

---

## 35. Host-Centric Security Summary (Single Host, Full Picture)
**As a** security admin, **I want** the Host Detail page to be my **single pane of glass** for everything about one host — open ports, alerts, SSH findings, port rules, and comments — **so that** I never need to visit 4 separate pages to understand one host's security posture.

**Implemented:** Host Detail now shows:
1. **EnrichedPortTable** — each port row shows rule status badge, alert status badge, SSH badge, service/banner, comment, and last seen. Expanding a row shows banner, SSH detail, matching rules, ACK reason, and inline actions (Acknowledge Alert, Create Rule via InlineRuleEditor).
2. **AlertsSection** — all alerts for this host with 3-option AckModal.
3. **SSHSecuritySection** — collapsible SSH detail (auto-expanded when issues found).
4. **AppliedRulesSection** — matching port rules (global + network-scoped) with delete action.

Old `OpenPortsSection` was deleted and replaced by `EnrichedPortTable`.

---

## 36. Simplified Navigation (Fewer Pages, Clearer Hierarchy)
**As a** user, **I want** a simpler navigation that groups related things together, **so that** I don't have to guess which of 5 pages has the information I need.

**Implemented:** Navigation reduced from 9 to 6 items:
```
Dashboard | Scanners | Networks | Hosts & Ports | Alerts | Trends | Users (admin)
```

Old routes redirect: `/risk-overview` → `/alerts`, `/ssh-security` → `/alerts`, `/ports` → `/hosts`, `/port-rules` → `/alerts`, `/policy` → `/alerts`.

Deleted pages (5,347 lines): `RiskOverview.tsx`, `OpenPorts.tsx`, `SSHSecurity.tsx`, `PortRules.tsx`, old `Alerts.tsx`.

---

## 37. Guided First-Time Triage Workflow
**As a** new user seeing alerts for the first time, **I want** a clear, guided flow that walks me through: **"Here's what was found → Here's what it means → Here's what to do"** — **so that** I can triage alerts without needing to understand the system's page structure first.

**Implemented:** The unified Alerts page provides inline triage:
1. **See the problem** — Alert list sorted by severity with IP, port, service, network, and severity columns.
2. **Understand the context** — Expanding a row shows service detection, host comment, hostname, matching port rules, SSH security detail, application banner, and rescan button.
3. **Take action** — AckModal with three options: "Acknowledge only", "Accept everywhere" (creates global ACCEPTED rule), "Accept in this network" (creates network-scoped rule). Plus inline "Create Rule" via InlineRuleEditor.
4. **See the result** — Filter tabs (All, Blocked, Pending, Approved, Monitoring) show alert state after action.

The 1685-line `RiskOverview.tsx` was decomposed into 6 focused components under `pages/Alerts/`.

---

## 38. Inline Port Rule Management (Create Rules Where You Work)
**As an** admin triaging alerts, **I want to** create, view, and edit port rules directly from the alert row or host detail — without navigating to the Port Rules page — **so that** whitelisting or blacklisting a port is a one-click action during triage, not a separate administrative task.

**Implemented:**
1. **From alert expanded row** — "Create Rule" button opens InlineRuleEditor pre-filled with IP and port.
2. **From Host Detail EnrichedPortTable** — "Create Rule" button in expanded port detail opens InlineRuleEditor.
3. **From Host Detail AppliedRulesSection** — shows all matching rules with delete action.
4. **InlineRuleEditor** — shared component with scope selector (global/network), port, IP, rule type (accepted/critical), and description fields.

Port Rules page was removed from top-level navigation and replaced by redirects to `/alerts`.

---

## 39. SSH as a Port Enrichment, Not a Separate World
**As a** user, **I want** SSH security information to appear **as context on the port** (port 22, 2222, etc.) rather than on a completely separate page — **so that** I don't have to mentally connect "the SSH Security page says port 22 on 10.0.0.5 has weak ciphers" with "the Alerts page says 10.0.0.5 has a new_port alert on port 22."

**Implemented:**
1. **Alerts page** — Expanding an SSH port alert shows auth methods (PubKey/Password/KbdInt badges), cipher warnings (Weak Ciphers/Weak KEX), SSH version, and last scanned timestamp.
2. **Host Detail EnrichedPortTable** — SSH ports show an SSHBadge (KEY/PASS/WEAK). Expanding shows full ExpandedSSHDetail with version, auth methods, and cipher status.
3. **Host Detail SSHSecuritySection** — Collapsible section with full SSH detail, auto-collapsed when no issues.
4. **SSH alert types** appear in the main Alerts list alongside port alerts.
5. **Standalone SSH Security page deleted** — `/ssh-security` redirects to `/alerts`.
