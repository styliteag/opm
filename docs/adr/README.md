# Architecture Decision Records

Decisions from the UI v3 (2026-07-14) and UI v4 (2026-10-16) redesign grilling sessions. Format: lightweight MADR
(Status / Context / Decision / Consequences).

| # | Title | Status |
|---|-------|--------|
| [0001](0001-ui-v3-big-bang-rewrite.md) | UI v3 is a big-bang rewrite on a dedicated branch | accepted |
| [0002](0002-task-based-navigation.md) | Navigation restructured into three task areas | superseded by 0009 |
| [0003](0003-alert-inbox-with-effect-based-actions.md) | Alert triage becomes an inbox with effect-based action names | amended by 0012 |
| [0004](0004-network-wizard-create-tab-editor-edit.md) | Network creation via wizard, editing via tab pages | superseded by 0011 |
| [0005](0005-executive-status-page.md) | Read-only executive status page for management | superseded by 0009 |
| [0006](0006-keep-design-system-and-english-ui.md) | Keep the Linear-inspired design system and English UI language | partly superseded by 0010 |
| [0007](0007-drop-trends-page.md) | Drop the standalone Trends page | accepted |
| [0008](0008-open-ports-are-the-product.md) | Open ports are the product; vulnerability scanning is secondary | accepted |
| [0009](0009-four-item-navigation.md) | Four-item navigation — Home, Ports, Networks, Settings | accepted |
| [0010](0010-plain-language-labels.md) | Plain-language labels; tool names become secondary detail | accepted |
| [0011](0011-inline-advanced-disclosure.md) | Advanced settings via inline disclosure; one-page network create | accepted |
| [0012](0012-triage-verbs.md) | Triage verbs — Expected, Snooze, Assign; Accept risk for findings | accepted |
| [0013](0013-raise-finding-alert-threshold.md) | Findings surface on Home only at high or critical by default | accepted |
| [0014](0014-ui-v4-big-bang-branch.md) | UI v4 is a big-bang rewrite on branch `ui-v4`, released as 3.0.0 | accepted |

Master plans: [v4](../redesign/ui-v4-plan.md) · [v3](../redesign/ui-v3-plan.md) ·
Inventory: [../redesign/ui-v4-feature-inventory.md](../redesign/ui-v4-feature-inventory.md) ·
Terminology: [../redesign/glossary.md](../redesign/glossary.md) ·
Parity gate: [../redesign/ui-v3-parity-matrix.md](../redesign/ui-v3-parity-matrix.md) ·
Alert semantics: [../redesign/alert-state-action-matrix.md](../redesign/alert-state-action-matrix.md)
