# ADR 0009: Four-item navigation — Home, Ports, Networks, Settings

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis
- Supersedes: [0002](0002-task-based-navigation.md), [0005](0005-executive-status-page.md) (merged into Home)

## Context

UI v3 shows 12 sidebar entries (Overview + Monitor 4 + Configuration 4 + Administration
3) plus "Scan Now". "Too many menu items/pages" is the top complaint. Role-based hiding
does not help: everyone is operator or admin. Dashboard and Overview overlap (same chart,
same counts) and are named inconsistently ("Dashboard" in nav, "Triage" as h1).

## Decision

Sidebar has four entries plus the Scan button:

| Entry | Contains |
|---|---|
| **Home** | Merged Dashboard + Overview: new-port review queue, important findings, per-network status lights, scanner/scan problems only when something is wrong. 30-day chart moves to network detail. |
| **Ports** | Primary tab: every open port across hosts (status, reason, service, network). Secondary tab: Hosts. Host detail stays a deep-linkable page. |
| **Networks** | List + detail. Network detail gets a Scans tab; scan detail stays deep-linkable. The global Scans page leaves the nav. |
| **Settings** | Sub-pages: Scanners · Rules (expected ports, always-critical, severity/accept-risk rules, SSH defaults) · Scan profiles (NSE profiles/scripts, GVM library) · Users · Organization · System. |

Account security moves into a proper user menu in the header.

## Consequences

- Alerts inbox is no longer a nav item; the queue lives on Home and alert deep links
  (`/alerts/$id`) redirect to the Home queue with that alert selected.
- Every v3 route gets a redirect (same practice as v3 cut-over) so bookmarks survive.
- Settings becomes one hub with a left sub-navigation instead of nested hub tabs with
  duplicated h1s.

## Amendment (2026-10-16)

Users still need a cross-network scan history. `/scans` is a "Recent scans" page again,
shown in the sidebar as an indented "Scans" sub-entry under Networks (the four main entries
stay) and linked from Home (network status strip and the Scans in progress strip) and the
Networks page header. Running and queued scans additionally show on
Home and in the Networks list.
