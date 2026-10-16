# UI v4 Master Plan — "Open ports first"

Outcome of the grilling session 2026-10-16. Decisions are ADRs 0008–0014 in
[docs/adr/](../adr/README.md); terminology in [glossary.md](glossary.md); current-state
inventory and bug list in [ui-v4-feature-inventory.md](ui-v4-feature-inventory.md).

## Problem

UI v3 cut navigation from 16 to 12 items, but users (mostly operators; the team are
effectively all admins) still call the UI too complicated: too many pages, results they
don't understand. Everyone sees everything, so role-based hiding is no lever. The tool
is lightly used today, so a full restructure is acceptable.

## North star

**OPM tells you which ports are open, which are new, and why — and lets you confirm them
in one click. Everything else is evidence on the port.** (ADR 0008)

## Decisions (summary)

| Topic | Decision | ADR |
|-------|----------|-----|
| Product focus | Ports are the primary object; vuln scanning is secondary evidence | 0008 |
| Navigation | Home · Ports · Networks · Settings (+ Scan button, user menu) | 0009 |
| Language | Plain labels; tool names as secondary detail | 0010 |
| Complexity | Defaults first, inline "Show advanced settings"; one-page network form | 0011 |
| Triage | Expected (host scope default, optional reason) · Snooze · Assign; Accept risk for findings | 0012 |
| Noise | Findings reach Home only at high+ by default | 0013 |
| Rollout | Big-bang on `ui-v4`, release 3.0.0 | 0014 |

## Target screens

**Home**
- Header: count to review, count of important findings.
- Review queue = new-port alerts grouped by IP:port across networks ("in N networks" badge): host, port, service, network, age, inline **Expected** ▾ / **Snooze** / Assign, keyboard j/k/e/s.
- Important findings (high+): finding title in plain words, host:port, **Snooze** / **Accept risk**.
- Network status strip (traffic lights). Scanner offline / scan failed banners only when true.

**Ports** (default tab) / Hosts
- Ports: every open port, filters status (New / To review / Expected / all), network, search; "Why" column = port comment, which Expected writes to (one field, ADR 0012).
- Hosts: inventory, inline hostname/comment.

**Host detail**
- Header: IP, hostname, network, "N to review · N important findings", **Scan again**.
- Port table with status + reason; expand row → findings for that port + history.
- Activity feed. Advanced: scans, known hostnames/vhosts, custom scan, raw IDs.

**Networks**
- List: name, address range, last status, next run, Scan now.
- Detail: status, hosts/ports counts, 30-day trend, tabs Ports · Scans · Settings (same form as create).
- Form: name, address range, scanner, ports preset, schedule preset (incl. Manual only), "Check for vulnerabilities"; everything else under Show advanced settings.

**Settings**: Scanners · Rules (Expected ports, Always critical, Accepted risks/severity rules, SSH defaults) · Scan profiles · Users · Organization · System.

## Phases (all on `ui-v4`; each phase browser-verified, `just check` green)

0. **Foundations** — new shell (4-item sidebar, user menu, Settings sub-nav), terminology module v4, shared "advanced disclosure", shared Findings + Port table components, redirect table.
1. **Backend** — allow scope param + optional reason; Accept-risk endpoint/mapping; fix GVM/nuclei/NSE Allow criteria (ADR 0012); default finding threshold → high (ADR 0013); hostname-lookup refresh permission (inventory bug #16). One vertical commit each with tests + CHANGELOG.
2. **Home** — merged Dashboard + Overview + queue.
3. **Ports + Host detail** — ports-first, per-port findings.
4. **Networks** — one-page form, detail with Scans tab, scan detail page.
5. **Settings** — all hubs re-homed; delete-confirm unified.
6. **Parity + cut-over** — walk inventory §2 and bug list §4 in the browser, redirects, delete v3 code, CHANGELOG, merge, `just release major` → 3.0.0.

## Browser walk-through notes (2026-10-16)

- Inbox: same `IP:53` alert ~10× (one per overlapping network) → grouping decided.
- GVM alert titles show raw OIDs; host Vulnerabilities tab lists 28 INFO tech-detections
  expanded by default — confirms ADRs 0010 / 0013.
- Host risk score "18 Low Risk" (green) next to a HIGH port — risk score must agree with
  port status or go.
- Dashboard 30-day chart empty with current data; Networks page leads with a red
  offline-scanner card.

## Open questions (decide during implementation)

- SSH alert types below high after ADR 0013 — which stay alerting by type?
- Remove `PATCH /alerts/{id}/severity` endpoint or keep for API users?
- Organization page fields (logo URL, policy URL) — used anywhere? Cut if not.
- Quick picks for Expected reasons: static list, learned from history, or both?
