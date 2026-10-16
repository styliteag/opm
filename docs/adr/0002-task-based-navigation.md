# ADR 0002: Navigation restructured into three task areas

- Status: superseded by [0009](0009-four-item-navigation.md)
- Date: 2026-07-14
- Deciders: Wim Bonis

## Context

The current sidebar has 16 entries in 4 groups (main / Tools / Settings / Admin). The
grouping mixes frequency and audience: "Scanners" sits in the Admin group but is not
admin-only, NSE lives in a "Tools" group nobody maps to a task, and alerting policy is
split across three places (Alert Rules, Severity Rules, SSH Defaults). Users report they
cannot find functions again.

Alternatives considered: flat navigation with a command palette (modern but a learning
curve), hub pages with tabs (hides functions one level deeper).

## Decision

Navigation is organized by **task frequency and audience**, into three areas plus one
executive entry:

```
Overview                      ← read-only status page (ADR 0005)
MONITOR        (daily work)   Dashboard · Alerts · Hosts · Scans
CONFIGURATION  (occasional)   Networks · Scanners · Scan Templates · Alerting
ADMINISTRATION (admin only)   Users & Roles · Organization · System
```

- **Scan Templates** bundles NSE profiles/scripts/editor and the GVM library.
- **Alerting** bundles alert rules, severity rules, and SSH alert defaults.
- **System** holds admin utilities (hostname cache, defaults).
- Roles hide whole areas (viewer sees Overview + Monitor; operator adds Configuration;
  admin sees everything). Account security (2FA) moves to the user menu.

## Consequences

- Top-level count drops from 16 to 11; every entry answers "when do I need this?".
- Deep links to old routes need redirects at cut-over.
- Bundled hubs (Scan Templates, Alerting) need internal tab navigation.
