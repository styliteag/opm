# ADR 0011: Advanced settings via inline disclosure; one-page network create

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis
- Supersedes: [0004](0004-network-wizard-create-tab-editor-edit.md)

## Context

Everyone is operator/admin, so role-based hiding does not reduce complexity. The network
form has ~45 values and ~75 controls in the worst case; the 5-step wizard spreads that
across steps instead of removing it. A global "advanced mode" toggle was rejected: users
forget its state and docs must describe two UIs.

## Decision

- Every form and detail page shows **sensible defaults first** and a **"Show advanced
  settings"** disclosure that expands engine knobs in place. No global mode, no hidden
  pages.
- **Network create is one page** with: name, address range (CIDR), scanner, ports preset
  (Common / All TCP / Custom), schedule preset (Manual / Daily / Weekly), and a "Check for
  vulnerabilities" toggle. Everything else (rate, timeouts, phases, protocol, scan engine,
  NSE profile, nuclei tags, GVM config, SSH overrides, alert recipients, custom cron) is
  advanced. Edit uses the same page.
- Dead or duplicated controls are removed, not hidden: the phase-card Tool select
  (overwritten on save), and duplicate port inputs.

## Consequences

- The wizard and the tabbed edit modal are replaced by one form component.
- Schedule gains an explicit "Manual only" option (fixes inventory bug #5).
- Exclude ports moves out of the hidden phase card into the advanced section's top level.
