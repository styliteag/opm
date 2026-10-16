# ADR 0005: Read-only executive status page for management

- Status: superseded by [0009](0009-four-item-navigation.md)
- Date: 2026-07-14
- Deciders: Wim Bonis

## Context

Management is one of the two complaining audiences, but their need is "is everything
green?", not operating the tool. Cramming both density (technicians) and simplicity
(management) into the same pages is what made the current UI fail both.

Alternatives considered: role-based simplification of existing pages (still one UI trying
to be two things), a full management portal with PDF export (too big for the first cut).

## Decision

One **read-only Overview page** (`/overview`):

- Traffic-light status per network (red = open critical alerts, amber = open high,
  green = neither), 30-day risk trend, top 5 current risks, open vs. resolved counts.
- Default landing page for the viewer/management role; technicians reach it via the
  sidebar's top entry.
- Backed by one new aggregate endpoint (`GET /api/overview/executive`) — the only
  backend feature work in the redesign.
- PDF export and scheduled delivery are explicitly deferred (see PLANNED-FEATURES.md
  story 4).

## Consequences

- Management stops needing the operational pages at all; those can stay dense.
- The aggregate endpoint needs its own service + tests (house backend rules apply).
- Traffic-light thresholds are fixed initially; making them configurable is a later
  decision if anyone asks.
