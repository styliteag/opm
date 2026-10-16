# ADR 0006: Keep the Linear-inspired design system and English UI language

- Status: accepted; "Tool names stay" superseded by [0010](0010-plain-language-labels.md)
- Date: 2026-07-14
- Deciders: Wim Bonis

## Context

"Rebuild everything" raised the question whether the visual language and UI language
change too. The complaints are about structure, findability, and wording — not about the
look. A new design system or i18n would delay every other improvement.

## Decision

- **Design system stays**: DESIGN.md tokens, dark theme, Inter, `font-emphasis`/
  `font-strong`, severity colors. UI v3 changes layout, density, and information
  architecture — not the visual identity.
- **UI language stays English**, with clearer wording (see ADR 0003). No i18n layer.
- **Tool names stay**: GVM, NSE, nuclei, OID, masscan, nmap map 1:1 to real products and
  remain visible in the UI. Clarity comes from context and consequence copy, not from
  renaming tools.

## Consequences

- No design-token or translation work anywhere in the plan.
- Copywriting effort concentrates on action labels, empty states, and inline
  explanations; the glossary is the single source of truth for terms.
