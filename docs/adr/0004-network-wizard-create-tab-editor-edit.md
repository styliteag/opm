# ADR 0004: Network creation via wizard, editing via tab pages

- Status: superseded by [0011](0011-inline-advanced-disclosure.md)
- Date: 2026-07-14
- Deciders: Wim Bonis

## Context

`NetworkForm.tsx` is 806 lines and shows every option at once: scanner type, phases,
NSE/nuclei/GVM settings, schedule builder, port rules, SSH overrides. Creating a simple
network and tuning an exotic GVM setup share one overwhelming screen. This was named
directly by users ("Formular-Monster").

Alternatives considered: predefined scan profiles (rejected — too much indirection for
now), progressive disclosure in a single form (rejected — still one giant page).

## Decision

- **Create = wizard** with small, guided steps:
  1. Basics (name, CIDR, description)
  2. Scan type (port discovery method; optional vulnerability scanning — NSE, nuclei,
     GVM — offered only in combinations the backend accepts)
  3. Schedule (presets first, custom builder behind them)
  4. Alerting (threshold, recipients, initial port rules)
  followed by a review step.
- **Edit = tab pages** with the same four groups. Direct access to any section, no
  step sequence for a single change.

## Consequences

- Wizard and tabs share section components; the grouping is defined once.
- Backend validation rules (e.g. nuclei only with masscan/nmap) must be mirrored as
  wizard branching so invalid combinations are impossible to select, not rejected after
  submit.
- The old monolithic form is deleted at cut-over.
