# ADR 0003: Alert triage becomes an inbox with effect-based action names

- Status: accepted; action names amended by [0012](0012-triage-verbs.md)
- Date: 2026-07-14
- Deciders: Wim Bonis

## Context

Alert triage is the single most frequent job in the UI. Today it is a filter-heavy table
(341-line filter component) with modal dialogs, and the state vocabulary confuses every
user: *dismiss* means "hide it, but the next scan raises it again", *accept* means "a
port rule is created and it never alerts again" — the crucial difference is documented
only in AGENTS.md, not in the UI. "Blocked" is not even a state, just a severity filter.

## Decision

1. **Inbox layout**: split view — alert list left, full detail right (host, port,
   history, evidence, matching rules). Keyboard shortcuts drive triage: j/k navigate,
   A opens the Allow dialog (scope selected explicitly), M the Mute dialog, S the
   assign control, Enter opens the host. Shortcuts open dialogs — they never mutate
   directly. Zero-inbox is the working model.
2. **Effect-based action names** (UI copy only; API and DB fields keep their names):
   - **Allow** (was Accept) — "creates a rule: this port is expected here; it will never
     alert again."
   - **Mute** (was Dismiss) — "hides this alert; the next scan will raise it again."
   - Assign / Resolve / Reopen keep their meanings.
   - The "Blocked" pseudo-status is removed; it becomes a plain severity filter.
   - Every action button carries a one-line consequence subtitle.
3. **Filters shrink** to: status (Open / Muted / Allowed), severity, network, source.
   State dimensions, action effects, scopes, and permissions are specified in
   [docs/redesign/alert-state-action-matrix.md](../redesign/alert-state-action-matrix.md).

## Consequences

- The UI-label ↔ API-field mapping (Allow ↔ `accept`/port rule, Mute ↔ `dismissed=true`)
  must be documented in the glossary and `docs/alert-states.md`, and frontend code uses a
  single terminology module so labels never drift per page.
- Endpoints (`PUT /alerts/{id}/dismiss`, `bulk-accept-global`, …) keep their names. One
  backend extension is required: the alert list API gains server-side queue/policy state
  (`queue_state`, `policy_state`) so Muted/Allowed filters paginate correctly — UI v2's
  client-side rule matching cannot filter a paginated list.
- No workflow states: `resolution_status` was dropped in migration 006; UI v3 does not
  reintroduce workflow tracking.
- Keyboard/split-view infrastructure is built in the first phase so it gets the longest
  beta soak.
