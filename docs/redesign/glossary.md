# UI Glossary (v4)

Single source of truth for user-facing terminology. Frontend code takes these strings from
one terminology module (`frontend/src/lib/terminology.ts`) so labels never drift between
pages. API and DB names do **not** change — the mapping below is permanent.

v4 changes (ADRs 0008–0014): navigation reduced to four areas, Allow/Mute renamed to
Expected/Snooze, new finding action Accept risk, tool names demoted to secondary labels.
The v3 terms are listed under "Retired terms" so old docs and bookmarks stay readable.

## Areas (navigation)

| Term | Meaning |
|------|---------|
| **Home** | What needs a decision: new-port review queue, important findings, per-network status, scanner/scan problems when present. Replaces Dashboard + Overview. |
| **Ports** | Every open port across hosts with status, reason, service, network. Second tab: **Hosts**. |
| **Networks** | Networks you scan; each network's detail page holds its scans and trend. |
| **Settings** | Scanners · Rules · Scan profiles · Users · Organization · System. |

## Port status (shown on every port)

| UI term | Meaning | API / DB reality |
|---------|---------|------------------|
| **New** | First seen in the latest scan and not yet decided. | open port alert with `dismissed=false`, first-seen in latest scan |
| **To review** | Open, no Expected rule, not new. | no matching accepted rule |
| **Expected** | Covered by an Expected rule; the reason is shown next to it. | matching `port_rules` / `global_port_rules` / alert rules with `rule_type='accepted'` |
| **Snoozed** | Hidden until the next scan raises it again. | `dismissed=true` without rule |
| **Why** | The one reason/comment on a port; Expected writes it. | port comment (`GlobalOpenPort` / host port comment) |
| **Always critical** | A rule makes this port alert as critical whenever it is open. | rule with `rule_type='critical'` |

## Actions

| UI term | Effect (button subtitle) | API / DB reality |
|---------|--------------------------|------------------|
| **Expected** | This port is supposed to be open here; it won't alert again. Scope: this host (default) · all hosts in this network · everywhere. Reason optional. | `bulk-accept-network` / `bulk-accept-global` → accepted rule (+ scope param, optional reason — v4 backend extension) + `dismissed=true` |
| **Snooze** | Hides this until the next scan finds it again. | `PUT /alerts/{id}/dismiss` → `dismissed=true`, no rule |
| **Accept risk** (findings only) | This finding is known and accepted; it won't pop up again on this network. Reason required. | GVM/nuclei/NSE: network-scoped severity rule → `info` (`/api/gvm-severity-rules`); SSH: accepted SSH alert rule for IP + alert type |
| **Assign** | A colleague takes ownership. | `assigned_to_user_id` |
| **Reopen** | Back to the queue. Existing Expected rule stays. | `PUT /alerts/{id}/reopen` → `dismissed=false` |
| **Revoke** | Deletes the rule; future scans alert again. | `DELETE /api/port-rules/{scope}/{id}` / alert rule delete |

## Plain labels for tools (ADR 0010)

Default UI uses the plain label; the tool name is shown as secondary text and as the
primary label inside advanced settings.

| Plain label | Tool / technical name |
|-------------|-----------------------|
| Port scan — fast | masscan |
| Port scan — detailed | nmap |
| Web vulnerability check | nuclei |
| Vulnerability scripts | NSE (nmap scripting engine) |
| Deep vulnerability scan | Greenbone / GVM |
| SSH check | ssh-audit / SSH probe |
| Finding ID | OID / nuclei `template:matcher` / `nse:<script>` |
| Address range | CIDR |
| Scan profile | NSE profile / GVM scan config |
| Finding | vulnerability result (`vulnerabilities` table) |

## Severity

Alerts and findings use one scale: **critical · high · medium · low · info**. Findings
reach Home only at or above the network's threshold, **high** by default (ADR 0013).

## Retired terms

| Old term | Replaced by | Note |
|----------|-------------|------|
| Allow / Allowed (v3) | Expected | same backend action |
| Mute / Muted (v3) | Snooze / Snoozed | same backend action |
| Accept / Dismiss (v2) | Expected / Snooze | API names unchanged |
| Severity Override (per alert) | Accept risk / severity rules | removed from UI (ADR 0012) |
| Dashboard, Triage, Overview | Home | merged (ADR 0009) |
| Monitor / Configuration / Administration | Home / Ports / Networks / Settings | ADR 0009 |
| Scan Templates | Settings → Scan profiles | |
| Alerting (hub) | Settings → Rules | |
| Alerts inbox | Home queue | `/alerts/$id` redirects to Home with that alert selected |
| Blocked | severity filter | never a state |

No workflow status: `resolution_status` was dropped in migration
`006_remove_resolution_status`; v4 does not reintroduce workflow tracking.
