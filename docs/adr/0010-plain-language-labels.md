# ADR 0010: Plain-language labels; tool names become secondary detail

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis
- Supersedes: the "Tool names stay" clause of [0006](0006-keep-design-system-and-english-ui.md) (design system and English UI stay)

## Context

ADR 0006 kept GVM, NSE, nuclei, OID, masscan, nmap as primary UI labels. The inventory
([ui-v4-feature-inventory.md](../redesign/ui-v4-feature-inventory.md)) shows this jargon
on nearly every page, and "don't understand results" is a top complaint.

## Decision

- The default UI uses **plain labels** for what a thing does: e.g. "Port scan", "Web
  vulnerability check", "Deep vulnerability scan", "Vulnerability scripts", "Finding ID".
  The exact mapping lives in [glossary.md](../redesign/glossary.md).
- The **tool name stays visible as secondary text** (badge, tooltip, detail line) and as
  the primary label inside advanced settings, so experts can still tell which engine ran.
- Design system and English UI language are unchanged (rest of ADR 0006 stands).

## Consequences

- `lib/terminology.ts` gains a tool-label map; no page hardcodes tool names as headings.
- API, DB, and scanner protocol names do not change.
