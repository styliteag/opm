# ADR 0008: Open ports are the product; vulnerability scanning is secondary

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis

## Context

After UI v3, users (mostly operators; the team are effectively all admins and everyone
sees everything) still call the UI too complicated. The complaints are too many menu
items/pages and results that people don't understand. UI v3 treated every alert source
(port, SSH, NSE, GVM, nuclei) as equal in one triage inbox, and gave vulnerability tooling
as much surface as port monitoring.

The product name says what matters: **open ports**. The questions an operator actually
asks are: which ports are open, which are newly open, why they are open, and how to say
"yes, that's fine" quickly. The vulnerability scanners (nuclei, GVM, NSE) are welcome
extras, but only really important findings should demand attention.

## Decision

1. **North star:** "OPM tells you which ports are open, which are new, and why — and lets
   you confirm them in one click. Everything else is evidence on the port."
2. **The port is the primary object.** Pages, navigation, and copy are built around
   `host:port`, not around scans, tools, or alert sources.
3. **The Home queue is built from new-port alerts** (today's alert model; unreviewed old
   ports do not flood the queue). Important findings appear in a separate, smaller
   section on Home.
4. **Findings live on the port.** SSH, web (nuclei), and vulnerability (GVM/NSE) findings
   are shown as evidence under the port they belong to on the host page. Only findings at
   or above the alert threshold (high by default, ADR 0013) surface on Home.
5. Vulnerability tooling stays fully functional and visible, but moves behind advanced
   disclosure (ADR 0011) and Settings (ADR 0009).

## Consequences

- Host detail becomes ports-first: one port table (status, reason, service) with
  expandable per-port findings; scans, vhosts, raw IDs and custom scan move to an
  Advanced section.
- The cross-host ports view becomes the primary list page ("Ports"), hosts secondary.
- The 4 parallel vulnerability UIs (host panel, scan table, nuclei summary, NSE section)
  converge on one per-port "Findings" component.
- Supersedes the "triage tool for all sources" north star of
  [ui-v3-plan.md](../redesign/ui-v3-plan.md).
