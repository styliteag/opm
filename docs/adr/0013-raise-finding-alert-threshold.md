# ADR 0013: Findings surface on Home only at high or critical by default

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis

## Context

"Make sure only really important findings pop up." Today GVM, nuclei, and NSE alert from
medium upward by default (`gvm_alert_severity` null → medium, `nuclei_severity` default
medium, NSE default medium).

## Decision

- The default alert threshold for vulnerability and SSH findings becomes **high**.
- Per-network thresholds and severity rules keep working and are edited under advanced
  network settings / Settings → Rules.
- Findings below the threshold are still stored and shown on the host page under their
  port; they just never enter the Home queue.

## Consequences

- This changes alert semantics (CLAUDE.md §8.3 escalation item) — explicitly decided here.
- Backend change: default threshold resolution in `services/vulnerability_results.py`
  and `services/nse_results.py`; existing networks with an explicit threshold keep it,
  null means high after the change. Needs a CHANGELOG `Changed` entry and tests.
- SSH alert severities must be mapped against the new floor (check which SSH alert types
  are below high today and decide per type during implementation).
