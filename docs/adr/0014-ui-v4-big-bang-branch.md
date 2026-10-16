# ADR 0014: UI v4 is a big-bang rewrite on branch `ui-v4`, released as 3.0.0

- Status: accepted
- Date: 2026-10-16
- Deciders: Wim Bonis

## Context

The tool is lightly used today, so a full restructure is acceptable. A page-by-page
rollout on `main` was considered; the team prefers one coherent cut-over like v3.

## Decision

- All work happens on branch `ui-v4`, rebased on `main` regularly; old-UI feature work is
  frozen meanwhile.
- Bugs from the inventory on pages that get rewritten are fixed by the rewrite and
  listed as acceptance criteria; backend bugs (e.g. the hostname-lookup permission) get
  their own commits.
- Merge to `main` after the parity walk-through, then `just release major` → 3.0.0.
- All v3 routes get redirects.

## Consequences

- Same risks and mitigations as ADR 0001 (branch drift, late parity gaps): parity is
  tracked in [ui-v4-plan.md](../redesign/ui-v4-plan.md).
