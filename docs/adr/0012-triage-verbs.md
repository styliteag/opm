# ADR 0012: Triage verbs — Expected, Snooze, Assign; Accept risk for findings

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis
- Amends: [0003](0003-alert-inbox-with-effect-based-actions.md)

## Context

UI v3 offers Allow, Mute, Assign, Reopen, Comment, a per-alert Severity Override, OID
severity rules, and Delete — four overlapping ways to silence or reweight something. For
a port, the question is binary: is it supposed to be open? For a finding, "Expected"
does not fit.

## Decision

**Port alerts** (default UI):
- **Expected** (was Allow) — one click. Default scope **this host only** (IP + port in this
  network); a dropdown offers "all hosts in this network" and "everywhere". Reason is
  **optional** with quick picks (e.g. "Web server", "Remote admin", "Vendor appliance",
  previous reasons for this port). The reason is shown next to the port everywhere.
- **Snooze** (was Mute) — hides until the next scan raises it again.
- **Assign**, inline comments, **Reopen** stay.

**Grouping:** the Home queue groups alerts by `IP:port` across networks (one row, badge
"in N networks"); Expected / Snooze apply to every alert in the group. Overlapping
networks raise one alert each today (seen live: one `IP:53` listed ~10×). Grouping is
UI-side; the backend keeps per-network alerts.

**One "Why" field:** the Expected reason is written to the port comment (existing
`propagate_dismiss_reason_to_port_and_host` path), and the UI shows a single "Why" column
everywhere. Rule descriptions stay in the DB but are not a second user-facing field.

**Finding alerts** (SSH, web, vulnerability):
- **Snooze** as above.
- **Accept risk** — reason **required** (audit trail). For finding-ID-based sources
  (GVM/nuclei/NSE) it creates a network-scoped severity rule lowering that finding to
  info; for SSH it creates an SSH accept rule for that IP + alert type.

**Removed from the default UI:** per-alert Severity Override (dropped entirely — severity
rules cover it), single-alert Delete (bulk delete stays under advanced). Severity rules
remain editable in Settings → Rules; "always alert as critical" port rules stay there too.

## Consequences

- Backend: allow endpoints gain a scope parameter (host / network / global) and accept an
  empty reason. Today `bulk-accept-*` require a reason and always write IP-specific
  criteria.
- Backend: for GVM/nuclei/NSE alerts, today's Allow writes `{"ip": ip}` without the
  finding ID (`routers/alerts/actions.py`), which may suppress every future finding of
  that source on the host — verify and fix as part of this work; Accept risk must not use
  that path.
- `PATCH /alerts/{id}/severity` loses its UI caller; keep the endpoint until removal is
  decided separately.
